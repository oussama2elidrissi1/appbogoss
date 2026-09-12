<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Partner;
use App\Models\PartnerOffering;
use App\Models\PartnerQrToken;
use App\Models\ServicePack;
use App\Services\ActivityLogger;
use App\Services\PartnerQrService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * L'ADMINISTRATION DU QR D'UN PARTENAIRE — jeton, vitrine, page, statistiques.
 *
 * Tout est monté derrière `permission:partners.manage`, la permission qui
 * garde déjà la fiche partenaire : aucune nouvelle permission à distribuer,
 * aucun rôle à revoir.
 *
 * Chaque écriture est scopée au partenaire de l'URL. Une offre appartenant à
 * un autre partenaire ne peut ni être lue ni être modifiée ici — le
 * verrouillage est fait par la relation, pas par une vérification qu'on
 * pourrait oublier.
 */
class PartnerQrAdminController extends Controller
{
    public function __construct(
        private readonly PartnerQrService $qr,
        private readonly ActivityLogger $activityLogger,
    ) {}

    // -------------------------------------------------------------- jeton

    /** Le QR du partenaire : jeton actif (émis à la demande) et son URL. */
    public function token(Partner $partner): JsonResponse
    {
        $token = $this->qr->currentToken($partner);

        return response()->json(['data' => $this->tokenPayload($token)]);
    }

    /** Régénère : l'ancien QR cesse d'attribuer, le nouveau prend la suite. */
    public function regenerateToken(Partner $partner): JsonResponse
    {
        $token = $this->qr->issueToken($partner);

        $this->activityLogger->log('partner_qr.token_regenerated', $partner, [], [
            'partner_id' => $partner->id,
        ]);

        return response()->json(['data' => $this->tokenPayload($token)]);
    }

    /** Coupe le QR sans en émettre un autre : plus aucune attribution. */
    public function revokeToken(Partner $partner): JsonResponse
    {
        $this->qr->revokeTokens($partner);

        $this->activityLogger->log('partner_qr.token_revoked', $partner, [], [
            'partner_id' => $partner->id,
        ]);

        return response()->json(['data' => ['revoked' => true]]);
    }

    // ------------------------------------------------------------ vitrine

    /** Les offres de CE partenaire, actives ou non, dans son ordre. */
    public function offerings(Partner $partner): JsonResponse
    {
        $offerings = $partner->offerings()->with(['service', 'pack.items.service'])->get();

        return response()->json([
            'data' => $offerings->map(fn (PartnerOffering $offering) => $this->offeringPayload($offering))->all(),
        ]);
    }

    public function storeOffering(Request $request, Partner $partner): JsonResponse
    {
        $validated = $this->validateOffering($request);

        // La cible doit exister ET correspondre au genre annoncé : on ne
        // range pas un pack dans `service_id`.
        if ($validated['kind'] === PartnerOffering::KIND_SERVICE) {
            $validated['service_pack_id'] = null;
        } else {
            $validated['service_id'] = null;
        }

        $this->assertTargetIsFree($partner, $validated);

        $validated['sort_order'] ??= (int) $partner->offerings()->max('sort_order') + 1;

        $offering = $partner->offerings()->create($validated);

        $this->activityLogger->log('partner_offering.created', $partner, [], [
            'partner_id' => $partner->id,
            'kind' => $offering->kind,
            'target' => $offering->service_id ?? $offering->service_pack_id,
        ]);

        return response()->json([
            'data' => $this->offeringPayload($offering->load(['service', 'pack.items.service'])),
        ], 201);
    }

    public function updateOffering(Request $request, Partner $partner, PartnerOffering $offering): JsonResponse
    {
        $this->assertBelongsTo($partner, $offering);

        $validated = $request->validate([
            'is_active' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'custom_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'custom_commission_type' => ['sometimes', 'nullable', Rule::in(['percentage', 'fixed'])],
            'custom_commission_value' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'custom_title' => ['sometimes', 'nullable', 'string', 'max:160'],
            'custom_description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'available_from' => ['sometimes', 'nullable', 'date'],
            'available_until' => ['sometimes', 'nullable', 'date', 'after_or_equal:available_from'],
        ]);

        $this->assertCommissionIsComplete($validated, $offering);

        $offering->update($validated);

        return response()->json([
            'data' => $this->offeringPayload($offering->fresh()->load(['service', 'pack.items.service'])),
        ]);
    }

    public function destroyOffering(Partner $partner, PartnerOffering $offering): JsonResponse
    {
        $this->assertBelongsTo($partner, $offering);

        $this->activityLogger->log('partner_offering.deleted', $partner, [], [
            'partner_id' => $partner->id,
            'offering_id' => $offering->id,
        ]);

        // Retirer de la vitrine ne touche ni au catalogue ni à l'historique :
        // les réservations déjà prises gardent leur trace (nullOnDelete).
        $offering->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    /** Réordonne la vitrine d'un seul partenaire, d'un seul appel. */
    public function reorderOfferings(Request $request, Partner $partner): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
        ]);

        $owned = $partner->offerings()->pluck('id')->flip();

        foreach (array_values($validated['ids']) as $position => $id) {
            if (! $owned->has($id)) {
                continue;
            }
            PartnerOffering::whereKey($id)->update(['sort_order' => $position]);
        }

        return response()->json(['data' => ['reordered' => true]]);
    }

    // --------------------------------------------------------------- page

    public function landing(Partner $partner): JsonResponse
    {
        $setting = $this->qr->landingSetting($partner);

        return response()->json(['data' => [
            'is_enabled' => (bool) $setting->is_enabled,
            'title' => $setting->title,
            'subtitle' => $setting->subtitle,
            'intro' => $setting->intro,
            'cover_image_url' => $setting->cover_image_url,
        ]]);
    }

    public function updateLanding(Request $request, Partner $partner): JsonResponse
    {
        $validated = $request->validate([
            'is_enabled' => ['sometimes', 'boolean'],
            'title' => ['sometimes', 'nullable', 'string', 'max:120'],
            'subtitle' => ['sometimes', 'nullable', 'string', 'max:160'],
            'intro' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'cover_image_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ]);

        $setting = $this->qr->landingSetting($partner);
        $setting->fill($validated)->save();

        return response()->json(['data' => [
            'is_enabled' => (bool) $setting->is_enabled,
            'title' => $setting->title,
            'subtitle' => $setting->subtitle,
            'intro' => $setting->intro,
            'cover_image_url' => $setting->cover_image_url,
        ]]);
    }

    // ------------------------------------------------------- statistiques

    public function stats(Partner $partner): JsonResponse
    {
        return response()->json(['data' => $this->qr->stats($partner)]);
    }

    /** Les réservations nées du QR de ce partenaire, les plus récentes d'abord. */
    public function bookings(Partner $partner): JsonResponse
    {
        $appointments = Appointment::with(['client', 'service'])
            ->where('partner_id', $partner->id)
            ->where('source', Appointment::SOURCE_PARTNER_QR)
            ->orderByDesc('starts_at')
            ->limit(100)
            ->get();

        return response()->json(['data' => $appointments->map(fn (Appointment $appointment) => [
            'id' => $appointment->id,
            'starts_at' => $appointment->starts_at?->format('Y-m-d H:i'),
            'status' => $appointment->status,
            'client_name' => $appointment->client?->name,
            'service_name' => $appointment->service?->name,
            'offering_id' => $appointment->partner_offering_id,
            'total' => round(
                collect($appointment->reservation_items ?? [])->sum(fn ($item) => (float) ($item['price_snapshot'] ?? 0)),
                2,
            ),
        ])->all()]);
    }

    // ------------------------------------------------------------- privé

    /** @return array<string, mixed> */
    private function validateOffering(Request $request): array
    {
        $validated = $request->validate([
            'kind' => ['required', Rule::in([PartnerOffering::KIND_SERVICE, PartnerOffering::KIND_PACK])],
            'service_id' => ['nullable', 'integer', Rule::exists('services', 'id')],
            'service_pack_id' => ['nullable', 'integer', Rule::exists('service_packs', 'id')],
            'is_active' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'custom_price' => ['nullable', 'numeric', 'min:0'],
            'custom_commission_type' => ['nullable', Rule::in(['percentage', 'fixed'])],
            'custom_commission_value' => ['nullable', 'numeric', 'min:0'],
            'custom_title' => ['nullable', 'string', 'max:160'],
            'custom_description' => ['nullable', 'string', 'max:2000'],
            'available_from' => ['nullable', 'date'],
            'available_until' => ['nullable', 'date', 'after_or_equal:available_from'],
        ]);

        $target = $validated['kind'] === PartnerOffering::KIND_SERVICE
            ? ($validated['service_id'] ?? null)
            : ($validated['service_pack_id'] ?? null);

        if ($target === null) {
            throw ValidationException::withMessages([
                'kind' => 'Choisissez la prestation ou le pack à proposer.',
            ]);
        }

        $this->assertCommissionIsComplete($validated, null);

        return $validated;
    }

    /**
     * Une commission spécifique se définit en deux morceaux ; un seul des
     * deux ne veut rien dire et laisserait une offre rémunérée au hasard.
     */
    private function assertCommissionIsComplete(array $validated, ?PartnerOffering $offering): void
    {
        $type = array_key_exists('custom_commission_type', $validated)
            ? $validated['custom_commission_type']
            : $offering?->custom_commission_type;
        $value = array_key_exists('custom_commission_value', $validated)
            ? $validated['custom_commission_value']
            : $offering?->custom_commission_value;

        if (($type === null) !== ($value === null)) {
            throw ValidationException::withMessages([
                'custom_commission_value' => 'Une commission spécifique demande à la fois un type et une valeur.',
            ]);
        }
    }

    /** La même prestation ne figure pas deux fois dans la même vitrine. */
    private function assertTargetIsFree(Partner $partner, array $validated): void
    {
        $exists = $partner->offerings()
            ->when(
                $validated['kind'] === PartnerOffering::KIND_SERVICE,
                fn ($query) => $query->where('service_id', $validated['service_id']),
                fn ($query) => $query->where('service_pack_id', $validated['service_pack_id']),
            )
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'kind' => 'Cette offre figure déjà dans la vitrine de ce partenaire.',
            ]);
        }
    }

    /** Le verrou anti-fuite : on ne touche qu'aux offres du partenaire visé. */
    private function assertBelongsTo(Partner $partner, PartnerOffering $offering): void
    {
        abort_unless($offering->partner_id === $partner->id, 404);
    }

    /** @return array<string, mixed> */
    private function tokenPayload(PartnerQrToken $token): array
    {
        return [
            'token' => $token->token,
            'url' => $this->qr->publicUrl($token->token),
            'issued_at' => $token->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function offeringPayload(PartnerOffering $offering): array
    {
        $isPack = $offering->kind === PartnerOffering::KIND_PACK;

        return [
            'id' => $offering->id,
            'kind' => $offering->kind,
            'service_id' => $offering->service_id,
            'service_pack_id' => $offering->service_pack_id,
            'catalog_name' => $isPack ? $offering->pack?->name : $offering->service?->name,
            'catalog_price' => $isPack
                ? ($offering->pack !== null ? (float) $offering->pack->price : null)
                : ($offering->service !== null ? (float) $offering->service->price : null),
            'title' => $offering->title(),
            'effective_price' => $offering->effectivePrice(),
            'duration_minutes' => $offering->durationMinutes(),
            'is_active' => (bool) $offering->is_active,
            'is_featured' => (bool) $offering->is_featured,
            'sort_order' => (int) $offering->sort_order,
            'custom_price' => $offering->custom_price !== null ? (float) $offering->custom_price : null,
            'custom_commission_type' => $offering->custom_commission_type,
            'custom_commission_value' => $offering->custom_commission_value !== null
                ? (float) $offering->custom_commission_value
                : null,
            'custom_title' => $offering->custom_title,
            'custom_description' => $offering->custom_description,
            'available_from' => $offering->available_from?->toDateString(),
            'available_until' => $offering->available_until?->toDateString(),
        ];
    }

    /** Le catalogue disponible pour composer une vitrine (services + packs). */
    public function catalog(): JsonResponse
    {
        return response()->json(['data' => [
            'services' => \App\Models\Service::where('is_active', true)
                ->orderBy('category')->orderBy('name')
                ->get(['id', 'name', 'category', 'price', 'duration_minutes'])
                ->all(),
            'packs' => ServicePack::where('is_active', true)
                ->with('items.service')
                ->orderBy('sort_order')->orderBy('id')
                ->get()
                ->map(fn (ServicePack $pack) => [
                    'id' => $pack->id,
                    'name' => $pack->name,
                    'price' => (float) $pack->price,
                    'effective_price' => $pack->effectivePrice(),
                    'duration_minutes' => $pack->durationMinutes(),
                ])
                ->all(),
        ]]);
    }
}
