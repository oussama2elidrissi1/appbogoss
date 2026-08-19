<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Partner;
use App\Models\PartnerCommission;
use App\Models\PartnerCommissionPayout;
use App\Models\PartnerServiceCommission;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The real, earned counterpart of Partner::commissionFor() (which only ever
 * estimates). There is no booking→payment conversion in this app, so accrual
 * is driven by client ownership at the moment a Prestation is actually paid,
 * not by matching an Appointment — see accrueForPrestation().
 */
class PartnerCommissionService
{
    /**
     * Called from PrestationService::confirmPayment(), after the Sale +
     * employee Commission rows already exist. A no-op unless the prestation's
     * client belongs to a partner. One row per PrestationItem, always
     * created (even at 0 commission) so "CA généré" can be summed from
     * base_amount independently of whether a rate is configured.
     */
    public function accrueForPrestation(Prestation $prestation): void
    {
        $client = $prestation->client;
        if ($client === null || $client->partner_id === null) {
            return;
        }

        /** @var Partner $partner */
        $partner = $client->partner()->firstOrFail();
        $rules = PartnerServiceCommission::where('partner_id', $partner->id)->get()->keyBy('service_id');

        foreach ($prestation->items as $item) {
            /** @var PrestationItem $item */
            $baseAmount = $item->is_free ? (float) ($item->public_price ?? 0) : $item->lineTotal();
            $rule = $item->service_id ? $rules->get($item->service_id) : null;

            $amount = match ($rule?->type) {
                'percentage' => round($baseAmount * (float) $rule->value / 100, 2),
                'fixed' => round((float) $rule->value, 2),
                default => 0.0,
            };

            PartnerCommission::create([
                'partner_id' => $partner->id,
                'client_id' => $client->id,
                'prestation_id' => $prestation->id,
                'prestation_item_id' => $item->id,
                'service_id' => $item->service_id,
                'rule_id' => $rule?->id,
                'type' => $rule?->type,
                'rate_or_amount' => $rule?->value,
                'base_amount' => $baseAmount,
                'amount' => $amount,
                'status' => PartnerCommission::STATUS_VALIDATED,
            ]);
        }
    }

    /** Mirrors PrestationService::refund()'s handling of employee Commission rows. */
    public function cancelForPrestation(Prestation $prestation): void
    {
        PartnerCommission::where('prestation_id', $prestation->id)
            ->where('status', PartnerCommission::STATUS_VALIDATED)
            ->update(['status' => PartnerCommission::STATUS_CANCELLED]);
    }

    /**
     * @return array{validated_total: float, paid_total: float}
     */
    public function summary(Partner $partner): array
    {
        return [
            'validated_total' => (float) PartnerCommission::where('partner_id', $partner->id)
                ->where('status', PartnerCommission::STATUS_VALIDATED)
                ->sum('amount'),
            'paid_total' => (float) PartnerCommission::where('partner_id', $partner->id)
                ->where('status', PartnerCommission::STATUS_PAID)
                ->sum('amount'),
        ];
    }

    /**
     * "Commission estimée" (§5/§11/§20) — potential commission on bookings
     * not yet paid (pending/confirmed), computed live from Appointment +
     * the commission grid. Never persisted: a booking may never convert into
     * a paid Prestation, or convert into one worth a different amount.
     */
    public function estimatedTotal(Partner $partner, ?Carbon $from = null, ?Carbon $to = null): float
    {
        $query = Appointment::where('partner_id', $partner->id)
            ->whereIn('status', ['pending', 'confirmed']);
        if ($from !== null && $to !== null) {
            $query->whereBetween('starts_at', [$from, $to]);
        }
        $appointments = $query->get(['id', 'status', 'reservation_items', 'service_id']);

        if ($appointments->isEmpty()) {
            return 0.0;
        }

        $serviceIds = $appointments
            ->flatMap(fn (Appointment $a) => collect($a->reservation_items ?: [['service_id' => $a->service_id]])
                ->pluck('service_id'))
            ->filter()
            ->unique();
        $prices = Service::whereIn('id', $serviceIds)->pluck('price', 'id');

        return (float) $appointments->sum(function (Appointment $appointment) use ($partner, $prices) {
            $items = collect($appointment->reservation_items ?: [['service_id' => $appointment->service_id]]);

            return $items->sum(function (array $item) use ($partner, $prices) {
                $price = $prices->get($item['service_id']);

                return $price !== null ? $partner->commissionFor((int) $item['service_id'], (float) $price) : 0.0;
            });
        });
    }

    /**
     * Marks the given validated commissions as paid in one payout — or every
     * outstanding validated commission when $commissionIds is null.
     *
     * @param  array<int>|null  $commissionIds
     */
    public function pay(
        Partner $partner,
        ?array $commissionIds,
        User $actor,
        ?string $paymentMethod = null,
        ?string $reference = null,
        ?string $notes = null,
    ): PartnerCommissionPayout {
        return DB::transaction(function () use ($partner, $commissionIds, $actor, $paymentMethod, $reference, $notes) {
            $query = PartnerCommission::where('partner_id', $partner->id)
                ->where('status', PartnerCommission::STATUS_VALIDATED);

            if ($commissionIds !== null) {
                $query->whereIn('id', $commissionIds);
            }

            /** @var \Illuminate\Support\Collection<int, PartnerCommission> $commissions */
            $commissions = $query->lockForUpdate()->get();

            if ($commissionIds !== null && $commissions->count() !== count(array_unique($commissionIds))) {
                throw ValidationException::withMessages([
                    'commission_ids' => 'Une ou plusieurs commissions sélectionnées ne sont plus disponibles au paiement.',
                ]);
            }

            if ($commissions->isEmpty()) {
                throw ValidationException::withMessages([
                    'commission_ids' => 'Aucune commission validée à payer pour ce partenaire.',
                ]);
            }

            $amount = round((float) $commissions->sum('amount'), 2);

            $payout = PartnerCommissionPayout::create([
                'partner_id' => $partner->id,
                'amount' => $amount,
                'payment_method' => $paymentMethod,
                'reference' => $reference,
                'paid_by_user_id' => $actor->id,
                'paid_at' => now(),
                'notes' => $notes,
            ]);

            PartnerCommission::whereIn('id', $commissions->pluck('id'))->update([
                'status' => PartnerCommission::STATUS_PAID,
                'partner_commission_payout_id' => $payout->id,
            ]);

            return $payout;
        });
    }
}
