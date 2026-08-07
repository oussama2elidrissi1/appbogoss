<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Models\Prestation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Mes prestations" — strictly scoped to the authenticated client's own
 * records (where('client_id', $client->id)), never anyone else's.
 */
class PortalPrestationsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $client = $request->user();

        $prestations = Prestation::where('client_id', $client->id)
            ->whereIn('status', [Prestation::STATUS_PAID, Prestation::STATUS_REFUNDED])
            ->with(['items', 'employee'])
            ->orderByDesc('confirmed_at')
            ->limit(100)
            ->get()
            ->map(function (Prestation $prestation) {
                $items = $prestation->items;
                $mode = 'Paiement';
                if ($items->isNotEmpty() && $items->every(fn ($item) => $item->is_free && $item->loyalty_reward_id !== null)) {
                    $mode = 'Récompense';
                } elseif ($items->isNotEmpty() && $items->every(fn ($item) => $item->is_free && $item->client_subscription_id !== null)) {
                    $mode = 'Abonnement';
                } elseif ($items->contains(fn ($item) => $item->is_free)) {
                    $mode = 'Mixte';
                }

                return [
                    'id' => $prestation->id,
                    'reference' => $prestation->reference,
                    'date' => $prestation->confirmed_at?->toDateString(),
                    'services' => $items->pluck('label')->implode(', '),
                    'employee_name' => $prestation->employee?->name,
                    'total' => (float) $prestation->total,
                    'mode' => $mode,
                    'status' => $prestation->status,
                ];
            });

        return response()->json(['data' => $prestations]);
    }
}
