<?php

namespace App\Http\Controllers\Api\Partner;

use App\Http\Controllers\Api\Partner\Concerns\RequiresActivePartner;
use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\PartnerCommission;
use App\Services\PartnerQrService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * L'ESPACE QR DU PARTENAIRE — son affiche, ses chiffres, ses réservations.
 *
 * Lecture seule, et strictement la sienne : `currentPartner()` lit le
 * partenaire du compte connecté, jamais un `partner_id` reçu. Aucun de ces
 * points d'entrée n'accepte d'identifiant de partenaire, donc il n'existe
 * aucun paramètre à falsifier pour voir les chiffres d'un confrère.
 *
 * Le partenaire ne configure rien : sa vitrine et sa page restent pilotées
 * par le Super Admin, conformément au partage des rôles existant.
 */
class PartnerQrController extends Controller
{
    use RequiresActivePartner;

    public function __construct(private readonly PartnerQrService $qr) {}

    /** Son QR, son lien, ses statistiques. */
    public function show(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);
        $token = $this->qr->currentToken($partner);
        $setting = $this->qr->landingSetting($partner);

        return response()->json(['data' => [
            'token' => $token->token,
            'url' => $this->qr->publicUrl($token->token),
            // Le partenaire voit si sa page est ouverte, sans pouvoir la
            // basculer : c'est une information, pas une commande.
            'landing_enabled' => (bool) $setting->is_enabled && $partner->canOperate(),
            'stats' => $this->qr->stats($partner),
        ]]);
    }

    /** Les réservations venues de son QR, avec la commission déjà acquise. */
    public function bookings(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);

        $appointments = Appointment::with(['client', 'service'])
            ->where('partner_id', $partner->id)
            ->where('source', Appointment::SOURCE_PARTNER_QR)
            ->orderByDesc('starts_at')
            ->limit(100)
            ->get();

        // La commission réellement acquise, prise dans le ledger existant et
        // regroupée par réservation — aucun recalcul, donc aucun risque
        // d'afficher un montant différent de la page Commissions.
        $earned = PartnerCommission::query()
            ->join('prestations', 'prestations.id', '=', 'partner_commissions.prestation_id')
            ->where('partner_commissions.partner_id', $partner->id)
            ->where('partner_commissions.status', '!=', PartnerCommission::STATUS_CANCELLED)
            ->whereIn('prestations.appointment_id', $appointments->pluck('id'))
            ->groupBy('prestations.appointment_id')
            ->selectRaw('prestations.appointment_id as appointment_id, SUM(partner_commissions.amount) as total')
            ->pluck('total', 'appointment_id');

        return response()->json(['data' => $appointments->map(fn (Appointment $appointment) => [
            'id' => $appointment->id,
            'starts_at' => $appointment->starts_at?->format('Y-m-d H:i'),
            'status' => $appointment->status,
            'client_name' => $appointment->client?->name,
            'service_name' => $appointment->service?->name,
            'estimated_total' => round(
                collect($appointment->reservation_items ?? [])->sum(fn ($item) => (float) ($item['price_snapshot'] ?? 0)),
                2,
            ),
            'commission_earned' => round((float) ($earned[$appointment->id] ?? 0), 2),
        ])->all()]);
    }
}
