<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Partner;
use App\Models\PartnerCommission;
use App\Models\PartnerCommissionPayout;
use App\Models\PartnerOffering;
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
 * estimates). Accrual happens at the moment a Prestation is actually paid.
 *
 * À QUI revient la commission — deux chemins, dans cet ordre :
 *
 *  1. LA RÉSERVATION. Si la prestation est née d'une réservation issue d'un
 *     QR partenaire (`prestations.appointment_id` → `appointments.source =
 *     partner_qr`), elle revient au partenaire de CETTE réservation. C'est le
 *     seul chemin qui attribue correctement un client déjà rattaché à un
 *     confrère, ou un client du salon que personne ne possède.
 *  2. LA PROPRIÉTÉ DU CLIENT. Sinon, comportement historique inchangé :
 *     `clients.partner_id` décide. Toute prestation sans QR se comporte
 *     exactement comme avant.
 *
 * COMBIEN — trois niveaux, du plus spécifique au plus général :
 *
 *  1. la commission négociée sur l'OFFRE scannée
 *     (`partner_offerings.custom_commission_*`), quand la réservation en
 *     porte une. C'est le seul moyen de rémunérer un PACK, qui n'existe pas
 *     dans la grille par service ;
 *  2. la grille `PartnerServiceCommission` du partenaire pour ce service ;
 *  3. rien — la ligne est quand même écrite, à 0, pour que « CA généré »
 *     reste sommable depuis `base_amount`.
 *
 * Une commission d'offre porte sur la prestation entière : elle est répartie
 * sur les lignes au prorata de leur montant, sans quoi un pack à commission
 * fixe paierait autant de fois qu'il contient de services.
 */
class PartnerCommissionService
{
    /**
     * Called from PrestationService::confirmPayment() and
     * PosService::checkout(), after the Sale + employee Commission rows
     * already exist. One row per PrestationItem, always created (even at 0
     * commission) so "CA généré" can be summed from base_amount independently
     * of whether a rate is configured.
     *
     * IDEMPOTENT : une prestation déjà accrochée n'est jamais accrochée deux
     * fois. C'est ce qui protège d'une double commission si l'encaissement
     * est rejoué, et ce qui rend sûr d'appeler cette méthode depuis les deux
     * caisses.
     */
    public function accrueForPrestation(Prestation $prestation): void
    {
        $partner = $this->partnerFor($prestation);
        if ($partner === null) {
            return;
        }

        $alreadyAccrued = PartnerCommission::where('prestation_id', $prestation->id)
            ->where('status', '!=', PartnerCommission::STATUS_CANCELLED)
            ->exists();
        if ($alreadyAccrued) {
            return;
        }

        $offering = $this->offeringFor($prestation);
        $rules = PartnerServiceCommission::where('partner_id', $partner->id)->get()->keyBy('service_id');

        // Assiette de la prestation : sert à répartir une commission d'offre,
        // qui vaut pour l'ensemble et non pour chaque ligne.
        $bases = [];
        foreach ($prestation->items as $item) {
            $bases[$item->id] = $item->is_free ? (float) ($item->public_price ?? 0) : $item->lineTotal();
        }
        $baseSum = round(array_sum($bases), 2);
        $offeringShares = $this->spreadOfferingCommission($offering, $bases, $baseSum);

        foreach ($prestation->items as $item) {
            /** @var PrestationItem $item */
            $baseAmount = $bases[$item->id];
            $rule = $item->service_id ? $rules->get($item->service_id) : null;

            if ($offeringShares !== null) {
                $amount = $offeringShares[$item->id] ?? 0.0;
                $type = $offering->custom_commission_type;
                $rateOrAmount = $offering->custom_commission_value;
                $ruleId = null;
            } else {
                $amount = match ($rule?->type) {
                    'percentage' => round($baseAmount * (float) $rule->value / 100, 2),
                    'fixed' => round((float) $rule->value, 2),
                    default => 0.0,
                };
                $type = $rule?->type;
                $rateOrAmount = $rule?->value;
                $ruleId = $rule?->id;
            }

            PartnerCommission::create([
                'partner_id' => $partner->id,
                // Le client de la prestation, qu'il appartienne ou non au
                // partenaire : la ligne dit qui a été servi, pas qui possède.
                'client_id' => $prestation->client_id,
                'prestation_id' => $prestation->id,
                'prestation_item_id' => $item->id,
                'service_id' => $item->service_id,
                'rule_id' => $ruleId,
                'type' => $type,
                'rate_or_amount' => $rateOrAmount,
                'base_amount' => $baseAmount,
                'amount' => $amount,
                'status' => PartnerCommission::STATUS_VALIDATED,
            ]);
        }
    }

    /**
     * Le partenaire à qui revient cette prestation : celui de la réservation
     * QR dont elle est née, sinon le propriétaire du client (historique).
     */
    private function partnerFor(Prestation $prestation): ?Partner
    {
        $appointment = $prestation->appointment_id !== null ? $prestation->appointment : null;

        if ($appointment !== null
            && $appointment->source === Appointment::SOURCE_PARTNER_QR
            && $appointment->partner_id !== null) {
            return Partner::find($appointment->partner_id);
        }

        $client = $prestation->client;
        if ($client === null || $client->partner_id === null) {
            return null;
        }

        return $client->partner()->first();
    }

    /** L'offre scannée, quand la prestation vient bien d'un QR partenaire. */
    private function offeringFor(Prestation $prestation): ?PartnerOffering
    {
        $appointment = $prestation->appointment_id !== null ? $prestation->appointment : null;

        if ($appointment === null
            || $appointment->source !== Appointment::SOURCE_PARTNER_QR
            || $appointment->partner_offering_id === null) {
            return null;
        }

        return PartnerOffering::find($appointment->partner_offering_id);
    }

    /**
     * Répartit la commission négociée d'une offre sur les lignes de la
     * prestation, au prorata de leur montant et le reste sur la dernière.
     *
     * Renvoie null quand l'offre ne porte aucune commission propre : la
     * grille par service reprend alors la main, niveau par niveau.
     *
     * @param  array<int, float>  $bases
     * @return array<int, float>|null
     */
    private function spreadOfferingCommission(?PartnerOffering $offering, array $bases, float $baseSum): ?array
    {
        if ($offering === null
            || $offering->custom_commission_type === null
            || $offering->custom_commission_value === null) {
            return null;
        }

        $value = (float) $offering->custom_commission_value;

        if ($offering->custom_commission_type === 'percentage') {
            // Un pourcentage se calcule ligne à ligne : il suit naturellement
            // les montants, aucune répartition à faire.
            return array_map(fn (float $base) => round($base * $value / 100, 2), $bases);
        }

        // Montant fixe : il vaut pour LA PRESTATION. Le répartir est ce qui
        // empêche un pack de trois services de payer trois fois la commission.
        $total = round($value, 2);
        $shares = [];
        $allocated = 0.0;
        $ids = array_keys($bases);
        $lastIndex = count($ids) - 1;

        foreach ($ids as $index => $itemId) {
            if ($index === $lastIndex) {
                $shares[$itemId] = round($total - $allocated, 2);

                continue;
            }
            $share = $baseSum > 0
                ? round($total * $bases[$itemId] / $baseSum, 2)
                : round($total / max(1, count($ids)), 2);
            $shares[$itemId] = $share;
            $allocated = round($allocated + $share, 2);
        }

        return $shares;
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
