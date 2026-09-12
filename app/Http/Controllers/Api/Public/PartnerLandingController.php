<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Models\PartnerOffering;
use App\Models\PartnerQrToken;
use App\Models\Service;
use App\Services\PartnerQrService;
use App\Services\PublicBookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * LA PAGE PUBLIQUE D'UN QR PARTENAIRE — /p/{token}.
 *
 * Tout ce que fait ce contrôleur part du jeton présent dans l'URL. Le
 * navigateur n'envoie jamais d'identifiant de partenaire, et il n'existe
 * aucun champ par lequel il pourrait en envoyer un : l'attribution est une
 * conséquence de l'URL scannée, pas une donnée de formulaire.
 *
 * Trois refus, tous rendus de la même façon — 404 « offre indisponible » :
 * jeton inconnu, jeton révoqué, partenaire suspendu ou page désactivée. Un
 * visiteur ne peut pas distinguer les cas, donc les jetons ne s'énumèrent pas.
 */
class PartnerLandingController extends Controller
{
    public function __construct(
        private readonly PartnerQrService $qr,
        private readonly PublicBookingService $booking,
    ) {}

    /** La vitrine : identité du salon, habillage du partenaire, offres. */
    public function show(Request $request, string $token): JsonResponse
    {
        $qrToken = $this->openTokenOrFail($token);
        $partner = $qrToken->partner;

        // Une visite, pas un affichage : rafraîchir ne recrée pas de scan.
        $visit = $this->qr->recordVisit(
            $qrToken,
            $this->qr->visitorKey($request, $request->query('sid')),
        );

        $settings = $this->qr->landingSetting($partner);
        $offerings = $this->qr->bookableOfferings($partner);

        return response()->json(['data' => [
            'partner' => [
                'display_name' => $partner->trade_name ?: $partner->name,
            ],
            'landing' => [
                'title' => $settings->title ?: 'BOGOS LAND',
                'subtitle' => $settings->subtitle ?: 'Barbershop & Hammam Turc',
                'intro' => $settings->intro ?: 'Prenez soin de vous.',
                'cover_image_url' => $settings->cover_image_url,
            ],
            'visit_id' => $visit->id,
            'offerings' => $offerings->map(fn (PartnerOffering $offering) => $this->offeringPayload($offering))->all(),
        ]]);
    }

    /** Les créneaux d'une offre — durée du service, ou du pack entier. */
    public function availability(Request $request, string $token): JsonResponse
    {
        $qrToken = $this->openTokenOrFail($token);

        $validated = $request->validate([
            'offering_id' => ['required', 'integer'],
            'date' => ['required', 'date'],
            'employee_id' => ['nullable', 'integer'],
        ]);

        $offering = $this->offeringOrFail($qrToken, (int) $validated['offering_id']);
        $primary = $this->primaryService($offering);

        return response()->json(['data' => $this->booking->availability(
            $primary,
            $validated['date'],
            $validated['employee_id'] ?? null,
            $offering->durationMinutes(),
        )]);
    }

    /**
     * La réservation. Le corps de la requête ne porte QUE le client, le
     * créneau et l'offre choisie : ni prix, ni partenaire, ni commission —
     * le serveur est seul à les connaître.
     */
    public function store(Request $request, string $token): JsonResponse
    {
        $qrToken = $this->openTokenOrFail($token);

        $validated = $request->validate([
            'offering_id' => ['required', 'integer'],
            'starts_at' => ['required', 'date'],
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:190'],
            'note' => ['nullable', 'string', 'max:500'],
            'sid' => ['nullable', 'string', 'max:64'],
        ]);

        $offering = $this->offeringOrFail($qrToken, (int) $validated['offering_id']);

        $appointment = $this->booking->bookFromPartnerOffering($validated, $qrToken->partner, $offering);

        // La conversion s'accroche à la visite de CE visiteur, jamais à une
        // visite désignée par la requête.
        $visit = $this->qr->recordVisit(
            $qrToken,
            $this->qr->visitorKey($request, $validated['sid'] ?? null),
        );
        $this->qr->markConverted($visit, $appointment);

        return response()->json(['data' => [
            'reference' => $appointment->id,
            'starts_at' => $appointment->starts_at?->format('Y-m-d H:i'),
            'status' => $appointment->status,
            'offering_title' => $offering->title(),
            'price' => $offering->effectivePrice(),
            'message' => 'Votre demande est enregistrée. Le salon vous confirme votre créneau très vite.',
        ]], 201);
    }

    // ------------------------------------------------------------- privé

    /**
     * Jeton actif, partenaire opérationnel, page activée — ou 404. Un seul
     * message pour les quatre causes : rien ne renseigne un curieux.
     */
    private function openTokenOrFail(string $token): PartnerQrToken
    {
        $qrToken = $this->qr->resolveToken($token);

        abort_if(
            $qrToken === null || $qrToken->partner === null || ! $this->qr->landingIsOpen($qrToken->partner),
            404,
            'Cette offre n’est actuellement pas disponible.',
        );

        return $qrToken;
    }

    /**
     * L'offre doit appartenir au partenaire du jeton ET être montrable
     * aujourd'hui. C'est le même filtre que l'affichage : rien ne peut être
     * réservé qui ne soit visible.
     */
    private function offeringOrFail(PartnerQrToken $qrToken, int $offeringId): PartnerOffering
    {
        $offering = $this->qr->findBookableOffering($qrToken->partner, $offeringId);

        if ($offering === null) {
            throw ValidationException::withMessages([
                'offering_id' => 'Cette offre n’est plus disponible.',
            ]);
        }

        return $offering;
    }

    /** La prestation qui porte l'éligibilité employé (la 1re d'un pack). */
    private function primaryService(PartnerOffering $offering): Service
    {
        $ids = $offering->serviceIds();
        $service = $ids !== [] ? Service::find($ids[0]) : null;

        if ($service === null) {
            throw ValidationException::withMessages([
                'offering_id' => 'Cette offre n’est plus disponible.',
            ]);
        }

        return $service;
    }

    /** @return array<string, mixed> */
    private function offeringPayload(PartnerOffering $offering): array
    {
        $isPack = $offering->kind === PartnerOffering::KIND_PACK;
        $catalogPrice = $isPack ? (float) ($offering->pack?->price ?? 0) : (float) ($offering->service?->price ?? 0);
        $price = $offering->effectivePrice();

        return [
            'id' => $offering->id,
            'kind' => $offering->kind,
            'title' => $offering->title(),
            'description' => $offering->custom_description
                ?: ($isPack ? $offering->pack?->description : null),
            'image_url' => $isPack ? $offering->pack?->image_url : null,
            'price' => $price,
            // Prix barré : uniquement quand il y a vraiment une remise à
            // montrer, jamais un barré décoratif.
            'compare_at_price' => $catalogPrice > $price ? round($catalogPrice, 2) : null,
            'duration_minutes' => $offering->durationMinutes(),
            'is_featured' => (bool) $offering->is_featured,
            'includes' => $isPack
                ? $offering->pack?->items
                    ->map(fn ($item) => [
                        'name' => $item->service?->name,
                        'quantity' => (int) $item->quantity,
                    ])
                    ->filter(fn (array $row) => $row['name'] !== null)
                    ->values()
                    ->all() ?? []
                : [],
            'category' => $isPack ? null : $offering->service?->category,
        ];
    }
}
