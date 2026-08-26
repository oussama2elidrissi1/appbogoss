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

            $locked->load(['items.service', 'items.employee']);

            if ($locked->items->isEmpty()) {
                throw ValidationException::withMessages(['items' => 'Ajoutez au moins un service avant d’encaisser.']);
            }

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
                    'itemable_type' => $service ? Service::class : null,
                    'itemable_id' => $service?->id,
                    'label' => $item->label,
                    'quantity' => $item->quantity,
                    'unit_price' => $effective['unit_price'],
                ]);

                // Commission: the LINE's employee, falling back to the ticket
                // owner. A line with no resolvable employee (e.g. free-text
                // walk-in sale on an ownerless invoice) simply earns nothing.
                $lineEmployee = $item->employee ?? $headerEmployee;

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

            $this->recordTips($locked, $data['tips'] ?? [], $activeDay->id, $actor);

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

        return $paid->fresh(['items.employee', 'items.service', 'commissions', 'sale', 'client', 'tips.employee']);
    }

    public function refund(Prestation $prestation, string $reason, User $actor): Prestation
    {
        $this->assertV2($prestation);

        return DB::transaction(function () use ($prestation, $reason, $actor) {
            $refunded = $this->prestations->refund($prestation, $reason, $actor);

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
            ->where('channel', Prestation::CHANNEL_CAISSE_V2)
            ->with(['items.employee', 'items.service', 'client', 'confirmedBy', 'createdBy', 'tips.employee', 'sale'])
            ->orderByDesc('created_at');

        $from = ! empty($filters['from']) ? $filters['from'] : now()->toDateString();
        $to = ! empty($filters['to']) ? $filters['to'] : $from;
        $query->whereDate('created_at', '>=', $from)->whereDate('created_at', '<=', $to);

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
    private function recordTips(Prestation $prestation, array $tips, int $workDayId, User $actor): void
    {
        if ($tips === []) {
            return;
        }
        if (count($tips) > 10) {
            throw ValidationException::withMessages(['tips' => 'Trop de lignes de pourboire (maximum 10).']);
        }

        $itemIds = $prestation->items->pluck('id')->flip();

        foreach ($tips as $tip) {
            $employeeId = isset($tip['employee_id']) ? (int) $tip['employee_id'] : 0;
            $amount = isset($tip['amount']) ? round((float) $tip['amount'], 2) : 0.0;
            $itemId = isset($tip['prestation_item_id']) ? (int) $tip['prestation_item_id'] : null;

            if ($amount <= 0) {
                throw ValidationException::withMessages(['tips' => 'Chaque pourboire doit avoir un montant positif.']);
            }
            if (Employee::whereKey($employeeId)->where('is_company', false)->doesntExist()) {
                throw ValidationException::withMessages(['tips' => 'Employé de pourboire introuvable.']);
            }
            if ($itemId !== null && ! $itemIds->has($itemId)) {
                throw ValidationException::withMessages(['tips' => 'La ligne associée au pourboire n’appartient pas à cette facture.']);
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
        }
    }

    /**
     * V2 sales always carry a non-null category (V1 prestation sales write
     * NULL, which the receipt/report layers tolerate badly): the single
     * category shared by every service line, else 'autre'.
     */
    private function dominantCategory(Prestation $prestation): string
    {
        $categories = $prestation->items
            ->map(fn (PrestationItem $item) => $item->service?->category)
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
