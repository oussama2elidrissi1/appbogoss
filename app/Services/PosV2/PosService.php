<?php

namespace App\Services\PosV2;

use App\Models\Appointment;
use App\Models\ClientSubscriptionUsage;
use App\Models\Commission;
use App\Models\Employee;
use App\Models\LoyaltyReward;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\PrestationStatusLog;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\SubscriptionPayment;
use App\Models\Tip;
use App\Models\User;
use App\Notifications\PrestationPaid;
use App\Services\ActivityLogger;
use App\Services\CommissionResolver;
use App\Services\LoyaltyEngine;
use App\Services\PartnerCommissionService;
use App\Services\PrestationService;
use App\Services\RewardRedemptionService;
use App\Services\SubscriptionService;
use App\Services\WorkDayService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Caisse V2 — invoice ("facture ouverte") lifecycle on top of the existing
 * prestations schema. Rides V1's rails on purpose:
 *
 *  - rows live in prestations/prestation_items with channel = 'caisse_v2',
 *    so every existing read path (reports, employee workspace, loyalty,
 *    subscriptions, partners) keeps seeing V2 money with zero changes;
 *  - reservation/release/confirm of rewards & subscription visits is
 *    delegated to the battle-tested V1 services, never reimplemented;
 *  - money moves ONLY in checkout(): one Sale on the CURRENTLY open work
 *    day (unlike V1, an invoice paid the day after it was opened books to
 *    the day the money actually entered the drawer);
 *  - all totals are recomputed server-side — the frontend's expected_total
 *    is only ever used to detect a stale cart, never trusted.
 *
 * V2-specific semantics V1 does not have: employee per line, line + invoice
 * discounts, tips (separate table, never in Sale.total), multi-beneficiary
 * labels, hold/resume, and the appointment -> invoice bridge.
 */
class PosService
{
    public const PAYMENT_METHODS = ['especes', 'carte', 'virement', 'mixte', 'autre'];

    public const BREAKDOWN_METHODS = ['especes', 'carte', 'virement', 'autre'];

    public const COIFFURE_TIP_COMMISSION_RATE = 50.0;

    public function __construct(
        private readonly WorkDayService $workDayService,
        private readonly PrestationService $prestations,
        private readonly CommissionResolver $commissionResolver,
        private readonly ActivityLogger $activityLogger,
        private readonly LoyaltyEngine $loyaltyEngine,
        private readonly RewardRedemptionService $rewardRedemptionService,
        private readonly SubscriptionService $subscriptionService,
        private readonly PartnerCommissionService $partnerCommissionService,
    ) {}

    // ------------------------------------------------------------------
    // Invoice lifecycle
    // ------------------------------------------------------------------

    /**
     * @param  array<string, mixed>  $data
     */
    public function open(array $data, User $actor): Prestation
    {
        $activeDay = $this->requireActiveDay("Aucune journée ouverte. Ouvrez la journée avant d'ouvrir une facture.");

        return DB::transaction(function () use ($data, $actor, $activeDay) {
            $prestation = Prestation::create([
                'reference' => 'FAC-'.now()->year.'-000000',
                'work_day_id' => $activeDay->id,
                'client_id' => $data['client_id'] ?? null,
                'client_label' => $data['client_label'] ?? null,
                'appointment_id' => $data['appointment_id'] ?? null,
                'employee_id' => null,
                'created_by_user_id' => $actor->id,
                'status' => Prestation::STATUS_DRAFT,
                'channel' => Prestation::CHANNEL_CAISSE_V2,
                'notes' => $data['notes'] ?? null,
            ]);

            $prestation->update(['reference' => sprintf('FAC-%s-%06d', now()->year, $prestation->id)]);

            $this->logTransition($prestation, null, Prestation::STATUS_DRAFT, $actor);
            $this->activityLogger->log('caisse_v2.invoice_opened', $prestation, [], [
                'client_id' => $prestation->client_id,
                'client_label' => $prestation->client_label,
                'appointment_id' => $prestation->appointment_id,
            ]);

            foreach ($data['items'] ?? [] as $item) {
                $this->addLine($prestation, $item, $actor, false);
            }

            $this->recalcTotals($prestation);

            return $prestation->fresh(['items.employee', 'items.service', 'client']);
        });
    }

    /**
     * Open (or return the already-open) invoice for a reservation, its lines
     * preloaded from reservation_items with the booking-time price snapshots
     * and per-line employees/beneficiaries (§37).
     */
    public function openFromAppointment(Appointment $appointment, User $actor): Prestation
    {
        if (in_array($appointment->status, ['cancelled', 'refused'], true)) {
            throw ValidationException::withMessages([
                'appointment' => 'Cette réservation est annulée — elle ne peut pas être ouverte en caisse.',
            ]);
        }

        $existing = Prestation::where('appointment_id', $appointment->id)
            ->where('channel', Prestation::CHANNEL_CAISSE_V2)
            ->whereNotIn('status', [Prestation::STATUS_CANCELLED, Prestation::STATUS_REFUNDED])
            ->orderByDesc('id')
            ->first();
        if ($existing !== null) {
            return $existing->load(['items.employee', 'items.service', 'client']);
        }

        $people = collect($appointment->people ?: []);
        $items = collect($appointment->reservation_items ?: [])
            ->map(function (array $line) use ($people) {
                $personIndex = $line['person_index'] ?? null;
                $beneficiary = $personIndex !== null ? ($people[$personIndex]['name'] ?? null) : null;

                return array_filter([
                    'service_id' => $line['service_id'] ?? null,
                    'employee_id' => $line['employee_id'] ?? null,
                    'unit_price' => isset($line['price_snapshot']) ? (float) $line['price_snapshot'] : null,
                    'duration_minutes' => $line['duration_minutes_snapshot'] ?? null,
                    'beneficiary_name' => $beneficiary,
                ], fn ($value) => $value !== null);
            })
            ->values()
            ->all();

        // Legacy single-service reservations have no reservation_items.
        if ($items === [] && $appointment->service_id !== null) {
            $items = [array_filter([
                'service_id' => $appointment->service_id,
                'employee_id' => $appointment->employee_id,
            ], fn ($value) => $value !== null)];
        }

        return $this->open([
            'client_id' => $appointment->client_id,
            'appointment_id' => $appointment->id,
            'items' => $items,
        ], $actor);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function addLine(Prestation $prestation, array $data, User $actor, bool $recalc = true): PrestationItem
    {
        $this->assertV2($prestation);

        // Product line (vente vitrine / réfrigérateur): label + price come
        // from the product, no employee, no commission. Stock is only
        // guarded softly here — the real lock + decrement happen at checkout.
        $product = null;
        if (! empty($data['product_id'])) {
            if (! empty($data['service_id'])) {
                throw ValidationException::withMessages([
                    'product_id' => 'Une ligne est soit un service, soit un produit.',
                ]);
            }
            if (! empty($data['client_subscription_id']) || ! empty($data['loyalty_reward_id'])) {
                throw ValidationException::withMessages([
                    'product_id' => 'Un produit ne peut pas être couvert par un abonnement ou une récompense.',
                ]);
            }
            $product = \App\Models\Product::find($data['product_id']);
            if ($product === null) {
                throw ValidationException::withMessages(['product_id' => 'Produit introuvable.']);
            }
            if ((int) $product->stock_quantity < max(1, (int) ($data['quantity'] ?? 1))) {
                throw ValidationException::withMessages([
                    'product_id' => sprintf('Stock insuffisant pour « %s » (%d restant).', $product->name, (int) $product->stock_quantity),
                ]);
            }
            $data['label'] = $product->name;
            $data['unit_price'] = (float) $product->price;
            $data['employee_id'] = null;
        }

        // §2 + §14 — the skills relation is enforced at line creation, not
        // just at checkout: an employee can only be put on a service they
        // actually perform (employees.service_categories / allowed_service_ids).
        $service = ! empty($data['service_id']) ? Service::find($data['service_id']) : null;
        if (! empty($data['employee_id'])) {
            $this->assertEmployeeCanPerform((int) $data['employee_id'], $service);
        } elseif ($service !== null && $service->requires_employee) {
            // §11 — exactly one employee can perform this service: assign
            // them automatically instead of asking a pointless question.
            $eligible = $this->eligibleEmployeesFor($service);
            if ($eligible->count() === 1) {
                $data['employee_id'] = $eligible->first()->id;
            }
        }

        // Reuses V1's addItem for the label/price defaults, the draft ->
        // in_progress transition and — critically — the reward/subscription
        // reservation logic with all its quota locks. recalc:false because
        // V1's recalc ignores V2 discounts; ours runs below.
        $item = $this->prestations->addItem($prestation, array_merge($data, [
            'usage_channel' => 'caisse',
            'usage_employee_id' => $data['employee_id'] ?? null,
        ]), $actor, false);

        $extra = array_filter([
            'employee_id' => $data['employee_id'] ?? null,
            'beneficiary_name' => $data['beneficiary_name'] ?? null,
            'product_id' => $product?->id,
        ], fn ($value) => $value !== null);
        if ($extra !== []) {
            $item->update($extra);
        }

        if ($recalc) {
            $this->recalcTotals($prestation);
        }

        return $item->fresh();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateLine(Prestation $prestation, PrestationItem $item, array $data, User $actor): PrestationItem
    {
        $this->assertV2($prestation);
        $this->assertEditable($prestation);
        $this->assertLineBelongs($prestation, $item);

        if ($item->is_free && (array_key_exists('unit_price', $data) || array_key_exists('quantity', $data))) {
            throw ValidationException::withMessages([
                'unit_price' => 'Cette ligne est couverte par un abonnement ou une récompense — son prix et sa quantité ne sont pas modifiables.',
            ]);
        }

        $changes = [];
        if (array_key_exists('quantity', $data) && $data['quantity'] !== null) {
            $changes['quantity'] = max(1, (int) $data['quantity']);
        }
        if (array_key_exists('unit_price', $data) && $data['unit_price'] !== null) {
            $changes['unit_price'] = round(max(0, (float) $data['unit_price']), 2);
        }
        if (array_key_exists('employee_id', $data)) {
            if ($data['employee_id'] !== null) {
                if ($item->product_id !== null) {
                    throw ValidationException::withMessages([
                        'employee_id' => 'Une ligne produit n’a pas d’employé responsable.',
                    ]);
                }
                $lineService = $item->service_id !== null ? Service::find($item->service_id) : null;
                $this->assertEmployeeCanPerform((int) $data['employee_id'], $lineService);
            }
            $changes['employee_id'] = $data['employee_id'];
        }
        if (array_key_exists('beneficiary_name', $data)) {
            $changes['beneficiary_name'] = $data['beneficiary_name'];
        }
        if (array_key_exists('notes', $data)) {
            $changes['notes'] = $data['notes'];
        }
        if (array_key_exists('discount_amount', $data)) {
            $changes['discount_amount'] = $data['discount_amount'] !== null
                ? round(max(0, (float) $data['discount_amount']), 2)
                : null;
            $changes['discount_reason'] = $data['discount_reason'] ?? null;
        }

        // Validate the prospective state BEFORE writing anything.
        $nextQuantity = (int) ($changes['quantity'] ?? $item->quantity);
        $nextUnitPrice = (float) ($changes['unit_price'] ?? $item->unit_price);
        $nextDiscount = array_key_exists('discount_amount', $changes)
            ? $changes['discount_amount']
            : ($item->discount_amount !== null ? (float) $item->discount_amount : null);
        if ($nextDiscount !== null && $nextDiscount > round($nextQuantity * $nextUnitPrice, 2)) {
            throw ValidationException::withMessages([
                'discount_amount' => 'La remise ne peut pas dépasser le montant de la ligne.',
            ]);
        }

        if ($changes !== []) {
            $old = $item->only(array_keys($changes));
            $item->update($changes);

            if (array_key_exists('discount_amount', $changes) || array_key_exists('unit_price', $changes)) {
                $this->activityLogger->log('caisse_v2.line_updated', $prestation, $old, $changes);
            }
        }

        $this->recalcTotals($prestation);

        return $item->fresh();
    }

    public function removeLine(Prestation $prestation, PrestationItem $item, User $actor): void
    {
        $this->assertV2($prestation);
        $this->assertLineBelongs($prestation, $item);

        $snapshot = $item->only(['label', 'quantity', 'unit_price', 'employee_id']);

        // V1's removeItem releases any reward/subscription reservation before
        // deleting — its own recalc runs with V1 semantics, ours fixes the
        // totals right after (same transaction-free sequence as V1).
        $this->prestations->removeItem($prestation, $item);
        $this->recalcTotals($prestation);

        $this->activityLogger->log('caisse_v2.line_removed', $prestation, $snapshot, []);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateInvoice(Prestation $prestation, array $data, User $actor): Prestation
    {
        $this->assertV2($prestation);
        $this->assertEditable($prestation);

        $changes = [];
        foreach (['client_id', 'client_label', 'notes'] as $field) {
            if (array_key_exists($field, $data)) {
                $changes[$field] = $data[$field];
            }
        }
        // Selecting a real client clears the walk-in label and vice versa.
        if (! empty($changes['client_id'])) {
            $changes['client_label'] = null;
        } elseif (! empty($changes['client_label'])) {
            $changes['client_id'] = null;
        }

        if (array_key_exists('discount_amount', $data)) {
            $changes['discount_amount'] = $data['discount_amount'] !== null
                ? round(max(0, (float) $data['discount_amount']), 2)
                : null;
            $changes['discount_reason'] = $data['discount_reason'] ?? null;
            $changes['discount_by_user_id'] = $data['discount_amount'] !== null ? $actor->id : null;
        }

        if ($changes !== []) {
            $old = $prestation->only(array_keys($changes));
            $prestation->update($changes);

            if (array_key_exists('discount_amount', $changes)) {
                $this->activityLogger->log('caisse_v2.discount_applied', $prestation, $old, [
                    'discount_amount' => $changes['discount_amount'],
                    'discount_reason' => $changes['discount_reason'] ?? null,
                ]);
            }
        }

        $this->recalcTotals($prestation);

        return $prestation->fresh(['items.employee', 'items.service', 'client']);
    }

    public function hold(Prestation $prestation, User $actor): Prestation
    {
        $this->assertV2($prestation);
        $this->assertEditable($prestation);

        $prestation->update(['held_at' => now()]);
        $this->activityLogger->log('caisse_v2.invoice_held', $prestation);

        return $prestation->fresh();
    }

    public function resume(Prestation $prestation, User $actor): Prestation
    {
        $this->assertV2($prestation);
        $this->assertEditable($prestation);

        $prestation->update(['held_at' => null]);
        $this->activityLogger->log('caisse_v2.invoice_resumed', $prestation);

        return $prestation->fresh();
    }

    public function cancel(Prestation $prestation, ?string $reason, User $actor): Prestation
    {
        $this->assertV2($prestation);

        return $this->prestations->cancel($prestation, $reason, $actor);
    }

    // ------------------------------------------------------------------
    // V1 pending queue bridge — prestations sent by employees from Mon
    // Espace (status pending_payment, channel NULL) can be taken over by
    // Caisse V2 instead of the V1 queue.
    // ------------------------------------------------------------------

    /** @return Builder<Prestation> */
    public function pendingPrestationsQuery(): Builder
    {
        return Prestation::query()
            ->whereNull('channel')
            ->where('status', Prestation::STATUS_PENDING_PAYMENT)
            ->with(['employee', 'client', 'items.service'])
            ->orderBy('validated_at');
    }

    /**
     * Take over an employee-sent prestation in Caisse V2.
     *
     * - Without target: the prestation is ADOPTED — it becomes a V2 open
     *   invoice (same row, same id), so reward/subscription reservations
     *   keep pointing at it untouched. Its per-line employee is filled from
     *   the header (the employee who did the work).
     * - With target: its lines are MOVED into the target open invoice
     *   (client's facture), reservations are re-pointed, and the source is
     *   closed as cancelled with an explicit trace — so the V1 queue can
     *   never charge it a second time.
     *
     * Money still only moves in checkout(); this is pure re-routing.
     */
    public function importPendingPrestation(Prestation $source, ?Prestation $target, User $actor): Prestation
    {
        return DB::transaction(function () use ($source, $target, $actor) {
            /** @var Prestation $lockedSource */
            $lockedSource = Prestation::query()->whereKey($source->id)->lockForUpdate()->firstOrFail();

            if ($lockedSource->channel === Prestation::CHANNEL_CAISSE_V2) {
                throw ValidationException::withMessages(['prestation' => 'Cette prestation est déjà en Caisse V2.']);
            }
            if ($lockedSource->status !== Prestation::STATUS_PENDING_PAYMENT) {
                throw ValidationException::withMessages([
                    'prestation' => 'Seule une prestation en attente de paiement peut être reprise en Caisse V2.',
                ]);
            }

            $lockedSource->load('items');

            if ($target === null) {
                // ---- Adopt: same row becomes a V2 open invoice. ----
                $lockedSource->items()
                    ->whereNull('employee_id')
                    ->update(['employee_id' => $lockedSource->employee_id]);

                $lockedSource->update([
                    'channel' => Prestation::CHANNEL_CAISSE_V2,
                    'status' => Prestation::STATUS_IN_PROGRESS,
                    'held_at' => null,
                ]);
                $this->logTransition($lockedSource, Prestation::STATUS_PENDING_PAYMENT, Prestation::STATUS_IN_PROGRESS, $actor);
                $this->activityLogger->log('caisse_v2.pending_adopted', $lockedSource, [], [
                    'employee_id' => $lockedSource->employee_id,
                ]);

                $this->recalcTotals($lockedSource);

                return $lockedSource->fresh(['items.employee', 'items.service', 'client']);
            }

            // ---- Merge into an existing open V2 invoice. ----
            /** @var Prestation $lockedTarget */
            $lockedTarget = Prestation::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            $this->assertV2($lockedTarget);
            $this->assertEditable($lockedTarget);

            if ($lockedSource->client_id !== null
                && $lockedTarget->client_id !== null
                && $lockedSource->client_id !== $lockedTarget->client_id) {
                throw ValidationException::withMessages([
                    'prestation' => 'Cette prestation appartient à un autre client que la facture sélectionnée.',
                ]);
            }
            if ($lockedTarget->client_id === null && $lockedSource->client_id !== null) {
                // A subscription/reward reservation is bound to the client —
                // the receiving invoice inherits them together.
                $lockedTarget->update(['client_id' => $lockedSource->client_id, 'client_label' => null]);
            }

            // Move the item rows themselves (ids preserved), stamping the
            // performing employee on each line.
            foreach ($lockedSource->items as $item) {
                $item->update([
                    'prestation_id' => $lockedTarget->id,
                    'employee_id' => $item->employee_id ?? $lockedSource->employee_id,
                ]);
            }

            // Re-point live reservations at the receiving invoice so
            // checkout confirms them (and cancelling the source releases
            // nothing that was transferred).
            ClientSubscriptionUsage::where('reserved_prestation_id', $lockedSource->id)
                ->where('status', ClientSubscriptionUsage::STATUS_RESERVED)
                ->update(['reserved_prestation_id' => $lockedTarget->id]);
            LoyaltyReward::where('reserved_prestation_id', $lockedSource->id)
                ->where('status', LoyaltyReward::STATUS_RESERVED)
                ->update(['reserved_prestation_id' => $lockedTarget->id]);

            if ($lockedTarget->status === Prestation::STATUS_DRAFT) {
                $lockedTarget->update(['status' => Prestation::STATUS_IN_PROGRESS]);
                $this->logTransition($lockedTarget, Prestation::STATUS_DRAFT, Prestation::STATUS_IN_PROGRESS, $actor);
            }

            // Close the (now empty) source with an explicit trace. Direct
            // update on purpose: PrestationService::cancel() would try to
            // release the reservations we just transferred.
            $reason = 'Fusionnée dans '.$lockedTarget->reference.' (Caisse V2)';
            $lockedSource->update([
                'status' => Prestation::STATUS_CANCELLED,
                'cancelled_at' => now(),
                'cancelled_by_user_id' => $actor->id,
                'cancel_reason' => $reason,
                'subtotal' => 0,
                'total' => 0,
            ]);
            PrestationStatusLog::create([
                'prestation_id' => $lockedSource->id,
                'from_status' => Prestation::STATUS_PENDING_PAYMENT,
                'to_status' => Prestation::STATUS_CANCELLED,
                'user_id' => $actor->id,
                'reason' => $reason,
            ]);
            $this->activityLogger->log('caisse_v2.pending_merged', $lockedSource, [], [
                'target_prestation_id' => $lockedTarget->id,
                'target_reference' => $lockedTarget->reference,
            ]);

            $this->recalcTotals($lockedTarget);

            return $lockedTarget->fresh(['items.employee', 'items.service', 'client']);
        });
    }

    // ------------------------------------------------------------------
    // Checkout — the only place V2 money moves
    // ------------------------------------------------------------------

    /**
     * @param  array<string, mixed>  $data
     */
    public function checkout(Prestation $prestation, array $data, User $actor): Prestation
    {
        $this->assertV2($prestation);

        $activeDay = $this->requireActiveDay("Aucune journée ouverte. Ouvrez la journée avant d'encaisser.");

        $paid = DB::transaction(function () use ($prestation, $data, $actor, $activeDay) {
            /** @var Prestation $locked */
            $locked = Prestation::query()->whereKey($prestation->id)->lockForUpdate()->firstOrFail();

            // Same double-click guard as V1's confirmPayment: the row lock
            // serializes concurrent requests, the status re-check kills the
            // second one.
            if (! in_array($locked->status, [Prestation::STATUS_DRAFT, Prestation::STATUS_IN_PROGRESS, Prestation::STATUS_SERVICES_DONE], true)) {
                throw ValidationException::withMessages([
                    'status' => 'Cette facture a déjà été traitée (encaissée ou annulée).',
                ]);
            }

            $locked->load(['items.service', 'items.employee', 'items.product']);

            if ($locked->items->isEmpty()) {
                throw ValidationException::withMessages(['items' => 'Ajoutez au moins un service avant d’encaisser.']);
            }

            // Product lines: lock + guard + decrement stock inside THIS
            // transaction — same guarantees as V1's quick-sale path, but
            // supporting quantities. A failure rolls everything back.
            foreach ($locked->items as $item) {
                if ($item->product_id === null) {
                    continue;
                }
                $lockedProduct = \App\Models\Product::query()->whereKey($item->product_id)->lockForUpdate()->first();
                if ($lockedProduct === null) {
                    continue; // product deleted since — the line stays a plain labeled line
                }
                if ((int) $lockedProduct->stock_quantity < (int) $item->quantity) {
                    throw ValidationException::withMessages([
                        'items' => sprintf(
                            'Stock insuffisant pour « %s » (%d restant, %d demandé).',
                            $lockedProduct->name,
                            (int) $lockedProduct->stock_quantity,
                            (int) $item->quantity,
                        ),
                    ]);
                }
                $lockedProduct->decrement('stock_quantity', (int) $item->quantity);
            }

            // §1 + §14 — UNE LIGNE = UN SERVICE = UN EMPLOYÉ RESPONSABLE.
            // Re-validated here under the lock, server-side: a tampered
            // request can never checkout a line whose employee is missing,
            // inactive, or not authorised for that service.
            $this->assertLinesHaveValidEmployees($locked);

            // -------- Server-side computation (never trust the client) ----
            $computation = $this->computeTotals($locked, array_key_exists('discount_amount', $data)
                ? ($data['discount_amount'] !== null ? round(max(0, (float) $data['discount_amount']), 2) : 0.0)
                : (float) ($locked->discount_amount ?? 0));
            $total = $computation['total'];

            // 0.05 MAD tolerance: per-line rounding of a distributed discount
            // can drift a couple of centimes from the UI's naive preview — a
            // genuinely stale cart differs by whole services, not centimes.
            if (array_key_exists('expected_total', $data) && $data['expected_total'] !== null
                && abs((float) $data['expected_total'] - $total) > 0.05) {
                throw ValidationException::withMessages([
                    'expected_total' => sprintf(
                        'Le total a changé (%.2f MAD calculé, %.2f MAD affiché) — vérifiez la facture avant d’encaisser.',
                        $total,
                        (float) $data['expected_total'],
                    ),
                ]);
            }

            [$paymentMethod, $breakdown, $amountReceived, $changeGiven] = $this->validatePayment($data, $total);

            // -------- Header employee: first line's employee owns the ticket
            $headerEmployeeId = $locked->items->first(fn (PrestationItem $item) => $item->employee_id !== null)?->employee_id
                ?? $locked->employee_id;
            $headerEmployee = $headerEmployeeId !== null ? Employee::find($headerEmployeeId) : null;

            // Pure-product ticket: attribute it to the company pseudo-employee
            // of the dominant stock area, exactly like V1's quick-sale does —
            // so Vitrine/Réfrigérateur revenue keeps its bucket in the
            // closing report. (No commission is ever created for it.)
            if ($headerEmployee === null) {
                $area = $locked->items
                    ->map(fn (PrestationItem $item) => $item->product?->stock_area)
                    ->filter()
                    ->countBy()
                    ->sortDesc()
                    ->keys()
                    ->first();
                if ($area !== null) {
                    $headerEmployee = Employee::query()
                        ->where('is_company', true)
                        ->where('company_area', $area)
                        ->first();
                }
            }

            $sale = Sale::create([
                'work_day_id' => $activeDay->id,
                'client_id' => $locked->client_id,
                'client_label' => $locked->client_label,
                'employee_id' => $headerEmployee?->id,
                'category' => $this->dominantCategory($locked),
                'total' => $total,
                'payment_method' => $paymentMethod,
                'print_count' => 0,
            ]);

            $totalCommission = 0.0;

            foreach ($locked->items as $item) {
                $service = $item->service;
                $effective = $computation['lines'][$item->id];

                $commissionBasis = null;
                $commissionOverride = null;

                if ($item->loyalty_reward_id !== null) {
                    $reward = LoyaltyReward::find($item->loyalty_reward_id);
                    if ($reward !== null) {
                        $this->rewardRedemptionService->confirm($reward, $item);
                        $commissionBasis = $reward->commission_basis;
                        $commissionOverride = $reward->commission_value !== null ? (float) $reward->commission_value : null;
                    }
                } elseif ($item->client_subscription_id !== null) {
                    $usage = ClientSubscriptionUsage::where('client_subscription_id', $item->client_subscription_id)
                        ->where('reserved_prestation_id', $locked->id)
                        ->where('status', ClientSubscriptionUsage::STATUS_RESERVED)
                        ->whereNull('prestation_item_id')
                        ->first();
                    if ($usage !== null) {
                        $this->subscriptionService->confirmUsage($usage, $item);
                        $planService = $usage->planService;
                        $commissionBasis = $planService?->commission_basis;
                        $commissionOverride = $planService?->commission_value !== null ? (float) $planService->commission_value : null;
                    }
                }

                SaleItem::create([
                    'sale_id' => $sale->id,
                    // Product::class matters: V1's void-restore path
                    // (TransactionController::destroy) re-increments stock
                    // from exactly this polymorphic type.
                    'itemable_type' => $item->product_id !== null
                        ? \App\Models\Product::class
                        : ($service ? Service::class : null),
                    'itemable_id' => $item->product_id ?? $service?->id,
                    'label' => $item->label,
                    'quantity' => $item->quantity,
                    'unit_price' => $effective['unit_price'],
                ]);

                // Commission: strictly the LINE's employee — the validation
                // above has already guaranteed every human-service line has
                // one. Only an optional-employee line (free-text,
                // requires_employee=false) can land here without one, and it
                // simply earns no commission.
                $lineEmployee = $item->employee;

                if ($lineEmployee === null) {
                    $item->update(['commission_type' => 'none', 'commission_value' => 0, 'commission_amount' => 0, 'commission_rule_id' => null]);

                    continue;
                }

                if ($item->is_free) {
                    $baseAmount = (float) ($item->public_price ?? 0);
                    $resolved = $this->commissionResolver->resolveForFreeLine(
                        $lineEmployee,
                        $service,
                        $commissionBasis ?? 'none',
                        $commissionOverride,
                        $baseAmount,
                    );
                } else {
                    // Base = what the client actually pays for this line
                    // (after line + invoice discounts).
                    $baseAmount = $effective['total'];
                    $resolved = $this->commissionResolver->resolve($lineEmployee, $service, $baseAmount);
                }

                $item->update([
                    'commission_type' => $resolved['type'],
                    'commission_value' => $resolved['value'],
                    'commission_amount' => $resolved['amount'],
                    'commission_rule_id' => $resolved['rule_id'],
                    'commission_basis' => $item->is_free ? $commissionBasis : $item->commission_basis,
                    'commission_base_override' => $item->is_free ? $commissionOverride : $item->commission_base_override,
                ]);

                Commission::create([
                    'prestation_id' => $locked->id,
                    'prestation_item_id' => $item->id,
                    'employee_id' => $lineEmployee->id,
                    'service_id' => $service?->id,
                    'rule_id' => $resolved['rule_id'],
                    'type' => $resolved['type'],
                    'rate_or_amount' => $resolved['value'],
                    'base_amount' => $baseAmount,
                    'amount' => $resolved['amount'],
                    'status' => Commission::STATUS_VALIDATED,
                ]);

                $totalCommission += $resolved['amount'];
            }

            $sale->update(['commission_amount' => round($totalCommission, 2)]);

            $locked->loadMissing('client');
            $this->partnerCommissionService->accrueForPrestation($locked);

            $fromStatus = $locked->status;
            $locked->update([
                'status' => Prestation::STATUS_PAID,
                'employee_id' => $headerEmployee?->id,
                'subtotal' => $computation['subtotal'],
                'total' => $total,
                'discount_amount' => $computation['invoice_discount'] > 0 ? $computation['invoice_discount'] : null,
                'discount_reason' => $data['discount_reason'] ?? $locked->discount_reason,
                'discount_by_user_id' => $computation['invoice_discount'] > 0
                    ? ($locked->discount_by_user_id ?? $actor->id)
                    : $locked->discount_by_user_id,
                'held_at' => null,
                'payment_method' => $paymentMethod,
                'payment_breakdown' => $breakdown,
                'amount_received' => $amountReceived,
                'change_given' => $changeGiven,
                'confirmed_at' => now(),
                'confirmed_by_user_id' => $actor->id,
                'sale_id' => $sale->id,
            ]);

            $tipCommissionTotal = $this->recordTips($locked, $data['tips'] ?? [], $activeDay->id, $actor, $sale);
            if ($tipCommissionTotal > 0) {
                $sale->update(['commission_amount' => round((float) $sale->commission_amount + $tipCommissionTotal, 2)]);
            }

            $this->loyaltyEngine->processSale($sale, $locked);

            $this->logTransition($locked, $fromStatus, Prestation::STATUS_PAID, $actor);
            $this->activityLogger->log('caisse_v2.checkout', $locked, [], [
                'sale_id' => $sale->id,
                'total' => $total,
                'payment_method' => $paymentMethod,
                'payment_breakdown' => $breakdown,
            ]);

            return $locked;
        });

        // Outside the transaction on purpose: a failing notification driver
        // must never roll back a completed payment.
        $paid->loadMissing('employee.user');
        if ($paid->employee?->user !== null) {
            Notification::send($paid->employee->user, new PrestationPaid($paid, (float) ($paid->sale?->commission_amount ?? 0)));
        }

        return $paid->fresh(['items.employee', 'items.service', 'commissions.employee', 'sale', 'client', 'tips.employee']);
    }

    public function refund(Prestation $prestation, string $reason, User $actor): Prestation
    {
        $this->assertV2($prestation);

        return DB::transaction(function () use ($prestation, $reason, $actor) {
            $refunded = $this->prestations->refund($prestation, $reason, $actor);

            // Product lines: put the stock back (mirror of the checkout
            // decrement, under lock) — V1's refund path never dealt with
            // products, so this lives here.
            $prestation->loadMissing('items');
            foreach ($prestation->items as $item) {
                if ($item->product_id === null) {
                    continue;
                }
                \App\Models\Product::query()->whereKey($item->product_id)->lockForUpdate()->first()
                    ?->increment('stock_quantity', (int) $item->quantity);
            }

            // Tips ride along: refunding the invoice voids its tips (soft
            // delete — history stays visible) so the day's tip totals match
            // what employees actually keep.
            $tipCount = $prestation->tips()->count();
            if ($tipCount > 0) {
                $prestation->tips()->delete();
                $this->activityLogger->log('caisse_v2.tips_voided', $prestation, [], ['count' => $tipCount, 'reason' => $reason]);
            }

            return $refunded;
        });
    }

    // ------------------------------------------------------------------
    // Reads: open invoices, history, dashboard
    // ------------------------------------------------------------------

    /** @return Builder<Prestation> */
    public function openInvoicesQuery(): Builder
    {
        return Prestation::query()
            ->where('channel', Prestation::CHANNEL_CAISSE_V2)
            ->whereIn('status', [Prestation::STATUS_DRAFT, Prestation::STATUS_IN_PROGRESS, Prestation::STATUS_SERVICES_DONE])
            ->with(['items.employee', 'items.service', 'client'])
            ->orderBy('created_at');
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Builder<Prestation>
     */
    public function historyQuery(array $filters): Builder
    {
        $query = Prestation::query()
            ->where(function (Builder $builder) {
                $builder->where('channel', Prestation::CHANNEL_CAISSE_V2)
                    ->orWhere(function (Builder $v1) {
                        $v1->whereNull('channel')
                            ->where(function (Builder $settled) {
                                $settled->whereIn('status', [Prestation::STATUS_PAID, Prestation::STATUS_REFUNDED])
                                    ->orWhere(function (Builder $cancelled) {
                                        $cancelled->where('status', Prestation::STATUS_CANCELLED)
                                            ->whereNotNull('validated_at');
                                    });
                            });
                    });
            })
            ->with(['employee', 'items.employee', 'items.service', 'items.product', 'client', 'confirmedBy', 'createdBy', 'tips.employee', 'commissions.employee', 'sale'])
            ->orderByDesc('created_at');

        if (! empty($filters['work_day_id'])) {
            $workDayId = (int) $filters['work_day_id'];
            $saleIdsForWorkDay = Sale::withTrashed()
                ->select('id')
                ->where('work_day_id', $workDayId);

            $query->where(function (Builder $builder) use ($workDayId, $saleIdsForWorkDay) {
                $builder->where('work_day_id', $workDayId)
                    ->orWhereIn('sale_id', $saleIdsForWorkDay);
            });
        } else {
            $from = ! empty($filters['from']) ? $filters['from'] : now()->toDateString();
            $to = ! empty($filters['to']) ? $filters['to'] : $from;
            $query->whereDate('created_at', '>=', $from)->whereDate('created_at', '<=', $to);
        }

        if (! empty($filters['time_from'])) {
            $query->whereTime('created_at', '>=', $filters['time_from']);
        }
        if (! empty($filters['time_to'])) {
            $query->whereTime('created_at', '<=', $filters['time_to']);
        }
        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (! empty($filters['payment_method'])) {
            $query->where('payment_method', $filters['payment_method']);
        }
        if (! empty($filters['service_id'])) {
            $query->whereHas('items', fn (Builder $items) => $items->where('service_id', $filters['service_id']));
        }
        if (! empty($filters['category'])) {
            $query->whereHas('items.service', fn (Builder $service) => $service->where('category', $filters['category']));
        }
        if (! empty($filters['employee_id'])) {
            $employeeId = (int) $filters['employee_id'];
            $query->where(function (Builder $builder) use ($employeeId) {
                $builder->where('employee_id', $employeeId)
                    ->orWhereHas('items', fn (Builder $items) => $items->where('employee_id', $employeeId));
            });
        }
        if (! empty($filters['client_id'])) {
            $query->where('client_id', (int) $filters['client_id']);
        }
        if (isset($filters['subscription']) && $filters['subscription'] !== null && $filters['subscription'] !== '') {
            $wantsSubscription = filter_var($filters['subscription'], FILTER_VALIDATE_BOOLEAN);
            $query->where(function (Builder $builder) use ($wantsSubscription) {
                $wantsSubscription
                    ? $builder->whereHas('items', fn (Builder $items) => $items->whereNotNull('client_subscription_id'))
                    : $builder->whereDoesntHave('items', fn (Builder $items) => $items->whereNotNull('client_subscription_id'));
            });
        }
        if (! empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function (Builder $builder) use ($search) {
                $builder->where('reference', 'like', "%{$search}%")
                    ->orWhere('client_label', 'like', "%{$search}%")
                    ->orWhereHas('client', fn (Builder $client) => $client->where('name', 'like', "%{$search}%"));
            });
        }

        return $query;
    }

    /**
     * Summary for the whole filtered history result, not just the current
     * page. V1 prestations use the header employee; V2 uses per-line employees.
     *
     * @param  Collection<int, Prestation>  $invoices
     * @return array<string, mixed>
     */
    public function historyStats(Collection $invoices): array
    {
        $paid = $invoices->where('status', Prestation::STATUS_PAID);
        $byEmployee = [];

        foreach ($paid as $invoice) {
            $invoice->loadMissing(['employee', 'items.employee', 'items.service', 'items.product', 'commissions.employee']);
            $computed = $this->computeTotals($invoice);

            foreach ($invoice->items as $item) {
                $lineEmployee = $item->employee;

                if ($lineEmployee === null && $invoice->channel !== Prestation::CHANNEL_CAISSE_V2) {
                    $lineEmployee = $invoice->employee;
                }

                if ($lineEmployee === null) {
                    continue;
                }

                $employeeId = (int) $lineEmployee->id;
                $entry = $byEmployee[$employeeId] ?? [
                    'employee_id' => $employeeId,
                    'employee_name' => $lineEmployee->name,
                    'performed_count' => 0,
                    'invoices_count' => 0,
                    'total' => 0.0,
                    'commission_total' => 0.0,
                    '_invoice_ids' => [],
                ];

                $entry['performed_count'] += max(1, (int) $item->quantity);
                $entry['_invoice_ids'][$invoice->id] = true;
                $entry['total'] += (float) ($computed['lines'][$item->id]['total'] ?? $item->effectiveLineTotal());

                $byEmployee[$employeeId] = $entry;
            }

            foreach ($invoice->commissions->where('status', Commission::STATUS_VALIDATED) as $commission) {
                $employee = $commission->employee;
                if ($employee === null) {
                    continue;
                }

                $employeeId = (int) $employee->id;
                $entry = $byEmployee[$employeeId] ?? [
                    'employee_id' => $employeeId,
                    'employee_name' => $employee->name,
                    'performed_count' => 0,
                    'invoices_count' => 0,
                    'total' => 0.0,
                    'commission_total' => 0.0,
                    '_invoice_ids' => [],
                ];
                $entry['_invoice_ids'][$invoice->id] = true;
                $entry['commission_total'] += (float) $commission->amount;
                $byEmployee[$employeeId] = $entry;
            }
        }

        $employees = collect($byEmployee)
            ->map(function (array $entry) {
                $entry['invoices_count'] = count($entry['_invoice_ids']);
                $entry['total'] = round((float) $entry['total'], 2);
                $entry['commission_total'] = round((float) $entry['commission_total'], 2);
                unset($entry['_invoice_ids']);

                return $entry;
            })
            ->sortByDesc('total')
            ->values()
            ->all();

        return [
            'paid_count' => $paid->count(),
            'paid_total' => round((float) $paid->sum(fn (Prestation $invoice) => (float) $invoice->total), 2),
            'v1_count' => $invoices->filter(fn (Prestation $invoice) => $invoice->channel === null)->count(),
            'v2_count' => $invoices->filter(fn (Prestation $invoice) => $invoice->channel === Prestation::CHANNEL_CAISSE_V2)->count(),
            'employees' => $employees,
        ];
    }

    /**
     * Today's caisse header (§33) — scoped to the active work day so it
     * matches V1's DayHeader figures, plus the V2-only blocks (open
     * invoices, tips, subscription installments).
     *
     * @return array<string, mixed>
     */
    public function dashboard(): array
    {
        $activeDay = $this->workDayService->getActiveDay();

        $openInvoices = $this->openInvoicesQuery()->get();

        $base = [
            'work_day' => $activeDay === null ? null : [
                'id' => $activeDay->id,
                'date' => $activeDay->date?->toDateString(),
                'opening_balance' => (float) $activeDay->opening_balance,
                'opened_by' => $activeDay->openedBy?->name,
            ],
            'open_invoices_count' => $openInvoices->count(),
            'open_invoices_total' => round((float) $openInvoices->sum(fn (Prestation $invoice) => (float) $invoice->total), 2),
        ];

        if ($activeDay === null) {
            return $base + [
                'revenue_total' => 0.0, 'ticket_count' => 0, 'v2_ticket_count' => 0,
                'payment_methods' => [], 'tips_total' => 0.0,
                'subscription_payments_total' => 0.0,
            ];
        }

        $sales = Sale::query()->where('work_day_id', $activeDay->id)->get();
        $v2SaleIds = Prestation::where('channel', Prestation::CHANNEL_CAISSE_V2)
            ->whereIn('sale_id', $sales->pluck('id'))
            ->pluck('sale_id')
            ->flip();

        $paymentMethods = $sales->groupBy(fn (Sale $sale) => $sale->payment_method ?: 'especes')
            ->map(fn ($group, $method) => [
                'method' => $method,
                'count' => $group->count(),
                'total' => round((float) $group->sum('total'), 2),
            ])->sortByDesc('total')->values()->all();

        $tipsTotal = (float) Tip::where('work_day_id', $activeDay->id)->sum('amount');

        $subscriptionSaleIds = SubscriptionPayment::whereIn('sale_id', $sales->pluck('id'))->pluck('sale_id');
        $subscriptionPaymentsTotal = $sales->whereIn('id', $subscriptionSaleIds->all())->sum('total');

        return $base + [
            'revenue_total' => round((float) $sales->sum('total'), 2),
            'ticket_count' => $sales->count(),
            'v2_ticket_count' => $sales->filter(fn (Sale $sale) => $v2SaleIds->has($sale->id))->count(),
            'payment_methods' => $paymentMethods,
            'tips_total' => round($tipsTotal, 2),
            'subscription_payments_total' => round((float) $subscriptionPaymentsTotal, 2),
        ];
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /**
     * Effective per-line prices with line discounts applied and the invoice
     * discount distributed proportionally across paying lines. The invoice
     * total is derived FROM the rounded per-line figures, so
     * Sale.total === Σ(sale_items.quantity × unit_price) holds by
     * construction — the invariant V1's header-level discount breaks (G3).
     *
     * @return array{subtotal: float, line_discounts: float, invoice_discount: float, total: float, lines: array<int, array{unit_price: float, total: float}>}
     */
    public function computeTotals(Prestation $prestation, ?float $invoiceDiscount = null): array
    {
        $prestation->loadMissing('items');
        $invoiceDiscount = round($invoiceDiscount ?? (float) ($prestation->discount_amount ?? 0), 2);

        $subtotal = 0.0;
        $lineDiscounts = 0.0;
        $bases = [];
        foreach ($prestation->items as $item) {
            $subtotal += $item->lineTotal();
            $lineDiscounts += min((float) ($item->discount_amount ?? 0), $item->lineTotal());
            $bases[$item->id] = $item->is_free ? 0.0 : $item->effectiveLineTotal();
        }
        $subtotal = round($subtotal, 2);
        $lineDiscounts = round($lineDiscounts, 2);

        $baseSum = round(array_sum($bases), 2);
        $invoiceDiscount = min($invoiceDiscount, $baseSum);

        // Distribute the invoice discount over paying lines, remainder on the
        // last paying line so the shares always sum exactly.
        $shares = [];
        $allocated = 0.0;
        $payingIds = array_keys(array_filter($bases, fn (float $base) => $base > 0));
        foreach ($payingIds as $index => $itemId) {
            if ($index === count($payingIds) - 1) {
                $share = round($invoiceDiscount - $allocated, 2);
            } else {
                $share = $baseSum > 0 ? round($invoiceDiscount * $bases[$itemId] / $baseSum, 2) : 0.0;
            }
            $share = min($share, $bases[$itemId]);
            $shares[$itemId] = $share;
            $allocated = round($allocated + $share, 2);
        }

        $lines = [];
        $total = 0.0;
        foreach ($prestation->items as $item) {
            $effective = max(0.0, round($bases[$item->id] - ($shares[$item->id] ?? 0.0), 2));
            $quantity = max(1, (int) $item->quantity);
            $unitPrice = round($effective / $quantity, 2);
            $lineTotal = round($unitPrice * $quantity, 2);

            $lines[$item->id] = ['unit_price' => $unitPrice, 'total' => $lineTotal];
            $total += $lineTotal;
        }

        return [
            'subtotal' => $subtotal,
            'line_discounts' => $lineDiscounts,
            'invoice_discount' => $invoiceDiscount,
            'total' => round($total, 2),
            'lines' => $lines,
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: string, 1: array<int, array{method: string, amount: float}>|null, 2: float|null, 3: float|null}
     */
    private function validatePayment(array $data, float $total): array
    {
        $method = $data['payment_method'] ?? null;
        if (! in_array($method, self::PAYMENT_METHODS, true)) {
            throw ValidationException::withMessages(['payment_method' => 'Moyen de paiement invalide.']);
        }

        $breakdown = null;
        if ($method === 'mixte') {
            $rows = $data['payment_breakdown'] ?? null;
            if (! is_array($rows) || count($rows) < 2) {
                throw ValidationException::withMessages([
                    'payment_breakdown' => 'Un paiement mixte doit détailler au moins deux moyens de paiement.',
                ]);
            }
            $breakdown = [];
            $sum = 0.0;
            foreach ($rows as $row) {
                $rowMethod = $row['method'] ?? null;
                $rowAmount = isset($row['amount']) ? round((float) $row['amount'], 2) : 0.0;
                if (! in_array($rowMethod, self::BREAKDOWN_METHODS, true) || $rowAmount <= 0) {
                    throw ValidationException::withMessages([
                        'payment_breakdown' => 'Répartition de paiement invalide.',
                    ]);
                }
                $breakdown[] = ['method' => $rowMethod, 'amount' => $rowAmount];
                $sum = round($sum + $rowAmount, 2);
            }
            if (abs($sum - $total) > 0.05) {
                throw ValidationException::withMessages([
                    'payment_breakdown' => sprintf('La répartition (%.2f MAD) ne correspond pas au total (%.2f MAD).', $sum, $total),
                ]);
            }
        }

        $amountReceived = null;
        $changeGiven = null;
        if ($method === 'especes' && isset($data['amount_received']) && $data['amount_received'] !== null) {
            $amountReceived = round((float) $data['amount_received'], 2);
            if ($amountReceived + 0.009 < $total) {
                throw ValidationException::withMessages([
                    'amount_received' => 'Le montant reçu est inférieur au total à payer.',
                ]);
            }
            // Server-side change — the UI shows it, the DB never trusts it.
            $changeGiven = round($amountReceived - $total, 2);
        }

        return [$method, $breakdown, $amountReceived, $changeGiven];
    }

    /**
     * @param  array<int, array<string, mixed>>  $tips
     */
    private function recordTips(Prestation $prestation, array $tips, int $workDayId, User $actor, Sale $sale): float
    {
        if ($tips === []) {
            return 0.0;
        }
        if (count($tips) > 10) {
            throw ValidationException::withMessages(['tips' => 'Trop de lignes de pourboire (maximum 10).']);
        }

        $itemIds = $prestation->items->pluck('id')->flip();
        // §10 — a tip can only go to an employee who actually worked on THIS
        // invoice (derived from the lines), never to the rest of the salon.
        $invoiceEmployeeIds = $prestation->items->pluck('employee_id')->filter()->unique()->flip();

        $tipCommissionTotal = 0.0;

        foreach ($tips as $tip) {
            $employeeId = isset($tip['employee_id']) ? (int) $tip['employee_id'] : 0;
            $amount = isset($tip['amount']) ? round((float) $tip['amount'], 2) : 0.0;
            $itemId = isset($tip['prestation_item_id']) ? (int) $tip['prestation_item_id'] : null;

            if ($amount <= 0) {
                throw ValidationException::withMessages(['tips' => 'Chaque pourboire doit avoir un montant positif.']);
            }

            if ($itemId === null && $employeeId !== 0) {
                $employeeLines = $prestation->items->where('employee_id', $employeeId)->values();
                if ($employeeLines->count() === 1) {
                    $itemId = $employeeLines->first()->id;
                }
            }

            if ($itemId !== null && ! $itemIds->has($itemId)) {
                throw ValidationException::withMessages(['tips' => 'La ligne associée au pourboire n’appartient pas à cette facture.']);
            }

            // §8 — a tip attached to a line belongs to that line's employee:
            // omitted -> derived from the line; mismatching -> refused.
            if ($itemId !== null) {
                $line = $prestation->items->firstWhere('id', $itemId);
                $lineEmployeeId = $line?->employee_id !== null ? (int) $line->employee_id : null;
                if ($lineEmployeeId === null) {
                    throw ValidationException::withMessages([
                        'tips' => sprintf('La ligne « %s » n’a pas d’employé — assignez-le avant d’y attacher un pourboire.', $line?->label ?? 'ligne'),
                    ]);
                }
                if ($employeeId === 0) {
                    $employeeId = $lineEmployeeId;
                } elseif ($employeeId !== $lineEmployeeId) {
                    throw ValidationException::withMessages([
                        'tips' => sprintf('Le pourboire de la ligne « %s » doit revenir à l’employé qui l’a réalisée.', $line?->label ?? 'ligne'),
                    ]);
                }
            }

            if ($employeeId === 0) {
                throw ValidationException::withMessages(['tips' => 'Choisissez l’employé bénéficiaire du pourboire.']);
            }
            if (! $invoiceEmployeeIds->has($employeeId)) {
                throw ValidationException::withMessages([
                    'tips' => 'Un pourboire ne peut revenir qu’à un employé présent sur cette facture.',
                ]);
            }
            if (Employee::whereKey($employeeId)->where('is_company', false)->doesntExist()) {
                throw ValidationException::withMessages(['tips' => 'Employé de pourboire introuvable.']);
            }

            $created = Tip::create([
                'prestation_id' => $prestation->id,
                'prestation_item_id' => $itemId,
                'employee_id' => $employeeId,
                'work_day_id' => $workDayId,
                'amount' => $amount,
                'payment_method' => $tip['payment_method'] ?? null,
                'notes' => $tip['notes'] ?? null,
                'created_by_user_id' => $actor->id,
            ]);

            $this->activityLogger->log('caisse_v2.tip_recorded', $created, [], [
                'prestation_id' => $prestation->id,
                'employee_id' => $employeeId,
                'amount' => $amount,
            ]);

            $line = $itemId !== null ? $prestation->items->firstWhere('id', $itemId) : null;
            if ($line?->service?->category === 'coiffure') {
                $tipCommission = round($amount * self::COIFFURE_TIP_COMMISSION_RATE / 100, 2);

                Commission::create([
                    'prestation_id' => $prestation->id,
                    'prestation_item_id' => $line->id,
                    'employee_id' => $employeeId,
                    'service_id' => $line->service_id,
                    'tip_id' => $created->id,
                    'rule_id' => null,
                    'type' => 'tip_percentage',
                    'rate_or_amount' => self::COIFFURE_TIP_COMMISSION_RATE,
                    'base_amount' => $amount,
                    'amount' => $tipCommission,
                    'status' => Commission::STATUS_VALIDATED,
                ]);

                $tipCommissionTotal = round($tipCommissionTotal + $tipCommission, 2);
                $this->activityLogger->log('caisse_v2.tip_commission_recorded', $sale, [], [
                    'prestation_id' => $prestation->id,
                    'prestation_item_id' => $line->id,
                    'employee_id' => $employeeId,
                    'rate' => self::COIFFURE_TIP_COMMISSION_RATE,
                    'base_amount' => $amount,
                    'amount' => $tipCommission,
                ]);
            }
        }

        return $tipCommissionTotal;
    }

    /**
     * V2 sales always carry a non-null category (V1 prestation sales write
     * NULL, which the receipt/report layers tolerate badly): the single
     * category shared by every service line, else 'autre'.
     */
    private function dominantCategory(Prestation $prestation): string
    {
        $categories = $prestation->items
            ->map(fn (PrestationItem $item) => $item->product_id !== null
                ? ($item->product?->stock_area === 'refrigerateur' ? 'boisson' : 'vitrine')
                : $item->service?->category)
            ->filter()
            ->unique()
            ->values();

        return $categories->count() === 1 ? (string) $categories->first() : 'autre';
    }

    private function recalcTotals(Prestation $prestation): void
    {
        $prestation->load('items');
        $computation = $this->computeTotals($prestation);

        $prestation->update([
            'subtotal' => $computation['subtotal'],
            'total' => $computation['total'],
        ]);
    }

    /**
     * Active, non-company employees allowed to perform this service —
     * mirrors Employee::canPerform() over the whole team.
     *
     * @return \Illuminate\Support\Collection<int, Employee>
     */
    private function eligibleEmployeesFor(Service $service): \Illuminate\Support\Collection
    {
        return Employee::query()
            ->where('is_active', true)
            ->where('is_company', false)
            ->get()
            ->filter(fn (Employee $employee) => $employee->canPerform($service))
            ->values();
    }

    /**
     * §2/§14 — the employee must exist, be active, be human, and (when the
     * line targets a catalog service) be authorised for that service.
     */
    private function assertEmployeeCanPerform(int $employeeId, ?Service $service): void
    {
        $employee = Employee::find($employeeId);

        if ($employee === null) {
            throw ValidationException::withMessages(['employee_id' => 'Employé introuvable.']);
        }
        if (! $employee->is_active || $employee->is_company) {
            throw ValidationException::withMessages([
                'employee_id' => sprintf('%s n’est plus actif — choisissez un autre employé.', $employee->name),
            ]);
        }
        if ($service !== null && ! $employee->canPerform($service)) {
            throw ValidationException::withMessages([
                'employee_id' => sprintf('%s ne réalise pas « %s » — choisissez un employé autorisé.', $employee->name, $service->name),
            ]);
        }
    }

    /**
     * §1/§14 — checkout gate: every line whose service requires a human must
     * carry an employee, and that employee must still be active and
     * authorised at the moment the money moves.
     */
    private function assertLinesHaveValidEmployees(Prestation $prestation): void
    {
        foreach ($prestation->items as $item) {
            $service = $item->service;

            if ($item->employee_id === null) {
                if ($service !== null && $service->requires_employee) {
                    throw ValidationException::withMessages([
                        'items' => sprintf('Employé manquant : veuillez sélectionner l’employé responsable de « %s ».', $item->label),
                    ]);
                }

                continue;
            }

            $employee = $item->employee;
            if ($employee === null) {
                throw ValidationException::withMessages([
                    'items' => sprintf('Employé introuvable pour « %s » — sélectionnez-le à nouveau.', $item->label),
                ]);
            }
            if (! $employee->is_active || $employee->is_company) {
                throw ValidationException::withMessages([
                    'items' => sprintf('%s n’est plus actif — choisissez un autre employé pour « %s ».', $employee->name, $item->label),
                ]);
            }
            if ($service !== null && ! $employee->canPerform($service)) {
                throw ValidationException::withMessages([
                    'items' => sprintf('%s ne réalise pas « %s » — choisissez un employé autorisé.', $employee->name, $service->name),
                ]);
            }
        }
    }

    private function requireActiveDay(string $message): \App\Models\WorkDay
    {
        $activeDay = $this->workDayService->getActiveDay();
        if ($activeDay === null) {
            throw ValidationException::withMessages(['work_day' => $message]);
        }

        return $activeDay;
    }

    private function assertV2(Prestation $prestation): void
    {
        if ($prestation->channel !== Prestation::CHANNEL_CAISSE_V2) {
            throw ValidationException::withMessages([
                'prestation' => 'Cette prestation n’appartient pas à la Caisse V2.',
            ]);
        }
    }

    private function assertEditable(Prestation $prestation): void
    {
        if (! $prestation->isEditableByEmployee()) {
            throw ValidationException::withMessages([
                'status' => 'Cette facture ne peut plus être modifiée à ce stade.',
            ]);
        }
    }

    private function assertLineBelongs(Prestation $prestation, PrestationItem $item): void
    {
        if ($item->prestation_id !== $prestation->id) {
            throw ValidationException::withMessages(['item' => 'Cette ligne n’appartient pas à cette facture.']);
        }
    }

    private function logTransition(Prestation $prestation, ?string $from, string $to, User $actor): void
    {
        PrestationStatusLog::create([
            'prestation_id' => $prestation->id,
            'from_status' => $from,
            'to_status' => $to,
            'user_id' => $actor->id,
        ]);

        $this->activityLogger->log(
            "prestation.{$to}",
            $prestation,
            $from !== null ? ['status' => $from] : [],
            ['status' => $to],
        );
    }
}
