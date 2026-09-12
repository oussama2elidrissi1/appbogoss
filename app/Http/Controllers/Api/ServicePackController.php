<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ServicePack;
use App\Models\ServicePackItem;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * CRUD des PACKS — des assemblages de prestations du catalogue vendus à un
 * prix d'ensemble.
 *
 * Un pack ne copie aucun service : `service_pack_items` ne contient que des
 * références. Modifier le catalogue reste sans effet sur le prix négocié du
 * pack, et sans risque de désynchronisation sur sa composition.
 *
 * Suppression : un pack déjà proposé par un partenaire n'est pas supprimé, il
 * est désactivé. C'est la convention du projet (on ne détruit pas ce à quoi
 * de l'historique est accroché) et cela évite de faire disparaître une offre
 * sous les pieds d'une réservation en cours.
 */
class ServicePackController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger) {}

    public function index(Request $request): JsonResponse
    {
        $packs = ServicePack::query()
            ->with('items.service')
            ->when(
                ! $request->boolean('include_inactive'),
                fn ($query) => $query->where('is_active', true),
            )
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $packs->map(fn (ServicePack $pack) => $this->payload($pack))->all()]);
    }

    public function show(ServicePack $servicePack): JsonResponse
    {
        return response()->json(['data' => $this->payload($servicePack->load('items.service'))]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request);

        $pack = DB::transaction(function () use ($validated) {
            $pack = ServicePack::create($this->attributes($validated));
            $this->syncItems($pack, $validated['items']);

            return $pack;
        });

        $this->activityLogger->log('service_pack.created', $pack, [], ['name' => $pack->name]);

        return response()->json(['data' => $this->payload($pack->load('items.service'))], 201);
    }

    public function update(Request $request, ServicePack $servicePack): JsonResponse
    {
        $validated = $this->validatePayload($request, $servicePack);
        $before = $servicePack->only(['name', 'price', 'promotional_price', 'is_active']);

        DB::transaction(function () use ($servicePack, $validated) {
            $servicePack->update($this->attributes($validated));
            if (array_key_exists('items', $validated)) {
                $this->syncItems($servicePack, $validated['items']);
            }
        });

        $this->activityLogger->log('service_pack.updated', $servicePack, $before, [
            'name' => $servicePack->name,
        ]);

        return response()->json(['data' => $this->payload($servicePack->fresh()->load('items.service'))]);
    }

    /**
     * Archive plutôt que supprimer dès que le pack est proposé quelque part.
     * Un pack jamais proposé, lui, part réellement — il n'a laissé aucune
     * trace à préserver.
     */
    public function destroy(ServicePack $servicePack): JsonResponse
    {
        $inUse = $servicePack->offerings()->exists();

        if ($inUse) {
            $servicePack->update(['is_active' => false]);
            $this->activityLogger->log('service_pack.archived', $servicePack, [], [
                'reason' => 'proposé par au moins un partenaire',
            ]);

            return response()->json(['data' => ['archived' => true]]);
        }

        $this->activityLogger->log('service_pack.deleted', $servicePack, [], ['name' => $servicePack->name]);
        $servicePack->delete();

        return response()->json(['data' => ['archived' => false]]);
    }

    // ------------------------------------------------------------- privé

    /** @return array<string, mixed> */
    private function validatePayload(Request $request, ?ServicePack $pack = null): array
    {
        $required = $pack === null ? 'required' : 'sometimes';

        return $request->validate([
            'name' => [$required, 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:2000'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'price' => [$required, 'numeric', 'min:0'],
            // Le prix promotionnel doit rester SOUS le prix de référence,
            // sinon le barré afficherait une fausse remise.
            'promotional_price' => ['nullable', 'numeric', 'min:0', 'lt:price'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'items' => [$required, 'array', 'min:1'],
            'items.*.service_id' => ['required', 'integer', Rule::exists('services', 'id')],
            'items.*.quantity' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);
    }

    /** @return array<string, mixed> */
    private function attributes(array $validated): array
    {
        return collect($validated)
            ->only(['name', 'description', 'image_url', 'price', 'promotional_price', 'is_active', 'sort_order'])
            ->all();
    }

    /**
     * Remplace la composition d'un bloc. Les doublons de service sont fondus
     * par l'index unique en base ; ici on les écarte en amont pour rendre une
     * erreur métier plutôt qu'une violation de contrainte.
     */
    private function syncItems(ServicePack $pack, array $items): void
    {
        $pack->items()->delete();

        $seen = [];
        foreach (array_values($items) as $index => $item) {
            $serviceId = (int) $item['service_id'];
            if (in_array($serviceId, $seen, true)) {
                continue;
            }
            $seen[] = $serviceId;

            ServicePackItem::create([
                'service_pack_id' => $pack->id,
                'service_id' => $serviceId,
                'quantity' => max(1, (int) ($item['quantity'] ?? 1)),
                'sort_order' => $index,
            ]);
        }
    }

    /** @return array<string, mixed> */
    private function payload(ServicePack $pack): array
    {
        return [
            'id' => $pack->id,
            'name' => $pack->name,
            'description' => $pack->description,
            'image_url' => $pack->image_url,
            'price' => (float) $pack->price,
            'promotional_price' => $pack->promotional_price !== null ? (float) $pack->promotional_price : null,
            'effective_price' => $pack->effectivePrice(),
            'duration_minutes' => $pack->durationMinutes(),
            'is_active' => (bool) $pack->is_active,
            'sort_order' => (int) $pack->sort_order,
            'items' => $pack->items->map(fn (ServicePackItem $item) => [
                'id' => $item->id,
                'service_id' => $item->service_id,
                'service_name' => $item->service?->name,
                'service_price' => $item->service !== null ? (float) $item->service->price : null,
                'quantity' => (int) $item->quantity,
            ])->all(),
        ];
    }
}
