<?php

namespace App\Services;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\PrestationStatusLog;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\User;
use App\Notifications\PrestationPaid;
use App\Notifications\PrestationSentToCaisse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Drives the Prestation state machine: draft -> in_progress -> services_done
 * -> pending_payment -> paid (or cancelled / refunded). Every transition is
 * written to prestation_status_logs. Money only moves — a Sale is only ever
 * created — inside confirmPayment(), so WorkDayService's revenue/report
 * queries (which read Sale unconditionally) never see a prestation that
 * hasn't actually been paid.
 */
class PrestationService
{
    public function __construct(
        private readonly WorkDayService $workDayService,
        private readonly CommissionResolver $commissionResolver,
        private readonly ActivityLogger $activityLogger,
    ) {
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data, Employee $employee, User $actor): Prestation
    {
        $activeDay = $this->workDayService->getActiveDay();

        if ($activeDay === null) {
            throw ValidationException::withMessages([
                'work_day' => "Aucune journée ouverte. Ouvrez la journée avant de créer une prestation.",
            ]);
        }

        return DB::transaction(function () use ($data, $employee, $actor, $activeDay) {
            $prestation = Prestation::create([
                'reference' => 'PRE-'.now()->year.'-000000',
                'work_day_id' => $activeDay->id,
                'client_id' => $data['client_id'] ?? null,
                'client_label' => $data['client_label'] ?? null,
                'employee_id' => $employee->id,
                'created_by_user_id' => $actor->id,
                'status' => Prestation::STATUS_DRAFT,
                'notes' => $data['notes'] ?? null,
            ]);

            $prestation->update(['reference' => sprintf('PRE-%s-%06d', now()->year, $prestation->id)]);

            $this->logTransition($prestation, null, Prestation::STATUS_DRAFT, $actor);

            foreach ($data['items'] ?? [] as $item) {
                $this->addItem($prestation, $item, $actor, false);
            }

            if (! empty($data['items'])) {
                $this->recalcTotals($prestation);
            }

            return $prestation->fresh(['items', 'employee', 'client']);
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function addItem(Prestation $prestation, array $data, User $actor, bool $recalc = true): PrestationItem
    {
        $this->assertEditable($prestation);

        $service = isset($data['service_id']) ? Service::find($data['service_id']) : null;
        $unitPrice = array_key_exists('unit_price', $data) && $data['unit_price'] !== null
            ? (float) $data['unit_price']
            : (float) ($service?->price ?? 0);

        $item = PrestationItem::create([
            'prestation_id' => $prestation->id,
            'service_id' => $service?->id,
            'label' => $data['label'] ?? $service?->name ?? 'Service',
            'quantity' => max(1, (int) ($data['quantity'] ?? 1)),
            'unit_price' => $unitPrice,
            'duration_minutes' => $data['duration_minutes'] ?? $service?->duration_minutes,
            'notes' => $data['notes'] ?? null,
        ]);

        if ($prestation->status === Prestation::STATUS_DRAFT) {
            $from = $prestation->status;
            $prestation->update(['status' => Prestation::STATUS_IN_PROGRESS]);
            $this->logTransition($prestation, $from, Prestation::STATUS_IN_PROGRESS, $actor);
        }

        if ($recalc) {
            $this->recalcTotals($prestation);
        }

        return $item;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateItem(Prestation $prestation, PrestationItem $item, array $data): PrestationItem
    {
        $this->assertEditable($prestation);

        $item->update(array_filter([
            'quantity' => isset($data['quantity']) ? max(1, (int) $data['quantity']) : null,
            'unit_price' => array_key_exists('unit_price', $data) ? (float) $data['unit_price'] : null,
            'notes' => array_key_exists('notes', $data) ? $data['notes'] : null,
        ], fn ($value) => $value !== null));

        $this->recalcTotals($prestation);

        return $item->fresh();
    }

    public function removeItem(Prestation $prestation, PrestationItem $item): void
    {
        $this->assertEditable($prestation);

        $item->delete();
        $this->recalcTotals($prestation);
    }

    public function markServicesDone(Prestation $prestation, User $actor): Prestation
    {
        $this->assertEditable($prestation);

        if ($prestation->items()->count() === 0) {
            throw ValidationException::withMessages(['items' => 'Ajoutez au moins un service avant de continuer.']);
        }

        $from = $prestation->status;
        $prestation->update(['status' => Prestation::STATUS_SERVICES_DONE]);
        $this->logTransition($prestation, $from, Prestation::STATUS_SERVICES_DONE, $actor);

        return $prestation->fresh();
    }

    public function sendToCaisse(Prestation $prestation, User $actor): Prestation
    {
        if ($prestation->status !== Prestation::STATUS_SERVICES_DONE) {
            throw ValidationException::withMessages(['status' => 'Terminez les services avant d’envoyer en caisse.']);
        }

        $from = $prestation->status;
        $prestation->update([
            'status' => Prestation::STATUS_PENDING_PAYMENT,
            'validated_at' => now(),
            'validated_by_user_id' => $actor->id,
        ]);
        $this->logTransition($prestation, $from, Prestation::STATUS_PENDING_PAYMENT, $actor);

        $admins = User::role(['admin', 'super-admin'])->get();
        if ($admins->isNotEmpty()) {
            Notification::send($admins, new PrestationSentToCaisse($prestation->fresh(['employee'])));
        }

        return $prestation->fresh();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function confirmPayment(Prestation $prestation, array $data, User $actor): Prestation
    {
        return DB::transaction(function () use ($prestation, $data, $actor) {
            /** @var Prestation $locked */
            $locked = Prestation::query()->whereKey($prestation->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== Prestation::STATUS_PENDING_PAYMENT) {
                throw ValidationException::withMessages([
                    'status' => 'Cette prestation a déjà été traitée (paiement déjà confirmé ou annulée).',
                ]);
            }

            $locked->load(['items', 'employee']);
            $discountAmount = (float) ($data['discount_amount'] ?? 0);
            $total = max(0, (float) $locked->items->sum(fn (PrestationItem $item) => $item->lineTotal()) - $discountAmount);

            $sale = Sale::create([
                'work_day_id' => $locked->work_day_id,
                'client_id' => $locked->client_id,
                'client_label' => $locked->client_label,
                'employee_id' => $locked->employee_id,
                'category' => null,
                'total' => $total,
                'payment_method' => $data['payment_method'],
                'print_count' => 0,
            ]);

            $totalCommission = 0.0;

            foreach ($locked->items as $item) {
                $service = $item->service_id ? Service::find($item->service_id) : null;

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'itemable_type' => $service ? Service::class : null,
                    'itemable_id' => $service?->id,
                    'label' => $item->label,
                    'quantity' => $item->quantity,
                    'unit_price' => $item->unit_price,
                ]);

                $resolved = $this->commissionResolver->resolve($locked->employee, $service, $item->lineTotal());

                $item->update([
                    'commission_type' => $resolved['type'],
                    'commission_value' => $resolved['value'],
                    'commission_amount' => $resolved['amount'],
                    'commission_rule_id' => $resolved['rule_id'],
                ]);

                Commission::create([
                    'prestation_id' => $locked->id,
                    'prestation_item_id' => $item->id,
                    'employee_id' => $locked->employee_id,
                    'service_id' => $service?->id,
                    'rule_id' => $resolved['rule_id'],
                    'type' => $resolved['type'],
                    'rate_or_amount' => $resolved['value'],
                    'base_amount' => $item->lineTotal(),
                    'amount' => $resolved['amount'],
                    'status' => Commission::STATUS_VALIDATED,
                ]);

                $totalCommission += $resolved['amount'];
            }

            $sale->update(['commission_amount' => round($totalCommission, 2)]);

            $locked->update([
                'status' => Prestation::STATUS_PAID,
                'total' => $total,
                'discount_amount' => $discountAmount > 0 ? $discountAmount : null,
                'payment_method' => $data['payment_method'],
                'payment_breakdown' => $data['payment_breakdown'] ?? null,
                'amount_received' => $data['amount_received'] ?? null,
                'change_given' => $data['change_given'] ?? null,
                'confirmed_at' => now(),
                'confirmed_by_user_id' => $actor->id,
                'sale_id' => $sale->id,
            ]);

            $this->logTransition($locked, Prestation::STATUS_PENDING_PAYMENT, Prestation::STATUS_PAID, $actor);

            $employeeUser = $locked->employee->user;
            if ($employeeUser !== null) {
                Notification::send($employeeUser, new PrestationPaid($locked, round($totalCommission, 2)));
            }

            return $locked->fresh(['items', 'commissions', 'sale', 'employee', 'client']);
        });
    }

    public function cancel(Prestation $prestation, ?string $reason, User $actor): Prestation
    {
        if (in_array($prestation->status, [Prestation::STATUS_PAID, Prestation::STATUS_CANCELLED, Prestation::STATUS_REFUNDED], true)) {
            throw ValidationException::withMessages([
                'status' => 'Une prestation payée ne peut pas être annulée — utilisez le remboursement.',
            ]);
        }

        $from = $prestation->status;
        $prestation->update([
            'status' => Prestation::STATUS_CANCELLED,
            'cancelled_at' => now(),
            'cancelled_by_user_id' => $actor->id,
            'cancel_reason' => $reason,
        ]);
        $this->logTransition($prestation, $from, Prestation::STATUS_CANCELLED, $actor, $reason);

        return $prestation->fresh();
    }

    public function refund(Prestation $prestation, string $reason, User $actor): Prestation
    {
        if ($prestation->status !== Prestation::STATUS_PAID) {
            throw ValidationException::withMessages(['status' => 'Seule une prestation payée peut être remboursée.']);
        }

        return DB::transaction(function () use ($prestation, $reason, $actor) {
            $prestation->update([
                'status' => Prestation::STATUS_REFUNDED,
                'refunded_at' => now(),
                'refunded_by_user_id' => $actor->id,
                'refund_reason' => $reason,
            ]);

            Commission::where('prestation_id', $prestation->id)->update(['status' => Commission::STATUS_CANCELLED]);

            $prestation->sale?->delete();

            $this->logTransition($prestation, Prestation::STATUS_PAID, Prestation::STATUS_REFUNDED, $actor, $reason);

            return $prestation->fresh(['items', 'commissions', 'sale']);
        });
    }

    private function assertEditable(Prestation $prestation): void
    {
        if (! $prestation->isEditableByEmployee()) {
            throw ValidationException::withMessages([
                'status' => 'Cette prestation ne peut plus être modifiée à ce stade.',
            ]);
        }
    }

    private function recalcTotals(Prestation $prestation): void
    {
        $prestation->load('items');
        $subtotal = (float) $prestation->items->sum(fn (PrestationItem $item) => $item->lineTotal());
        $prestation->update([
            'subtotal' => $subtotal,
            'total' => $subtotal,
        ]);
    }

    private function logTransition(Prestation $prestation, ?string $from, string $to, User $actor, ?string $reason = null): void
    {
        PrestationStatusLog::create([
            'prestation_id' => $prestation->id,
            'from_status' => $from,
            'to_status' => $to,
            'user_id' => $actor->id,
            'reason' => $reason,
        ]);

        $this->activityLogger->log(
            "prestation.{$to}",
            $prestation,
            $from !== null ? ['status' => $from] : [],
            ['status' => $to, 'reason' => $reason],
        );
    }
}
