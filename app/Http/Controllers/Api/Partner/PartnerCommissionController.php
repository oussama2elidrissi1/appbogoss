<?php

namespace App\Http\Controllers\Api\Partner;

use App\Http\Controllers\Api\Partner\Concerns\RequiresActivePartner;
use App\Http\Controllers\Controller;
use App\Models\PartnerCommission;
use App\Services\PartnerCommissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Mes commissions" (§11) — résumé (estimée/validée/payée) + historique
 * détaillé, all read from the persisted ledger (never Partner::commissionFor()
 * recomputed at render, per §27).
 */
class PartnerCommissionController extends Controller
{
    use RequiresActivePartner;

    public function __construct(private readonly PartnerCommissionService $commissionService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);
        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:validated,paid,cancelled'],
        ]);

        $query = PartnerCommission::where('partner_id', $partner->id)
            ->with(['client', 'service', 'prestation', 'payout'])
            ->orderByDesc('created_at');

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        $rows = $query->get();
        $summary = $this->commissionService->summary($partner);

        return response()->json([
            'data' => $rows->map(fn (PartnerCommission $commission) => [
                'id' => $commission->id,
                'client_id' => $commission->client_id,
                'client_name' => $commission->client?->name,
                'service_name' => $commission->service?->name,
                'prestation_reference' => $commission->prestation?->reference,
                'base_amount' => (float) $commission->base_amount,
                'type' => $commission->type,
                'rate_or_amount' => $commission->rate_or_amount !== null ? (float) $commission->rate_or_amount : null,
                'amount' => (float) $commission->amount,
                'status' => $commission->status,
                'created_at' => $commission->created_at?->toIso8601String(),
                'paid_at' => $commission->payout?->paid_at?->toIso8601String(),
            ])->values(),
            'meta' => [
                'estimated_total' => round($this->commissionService->estimatedTotal($partner), 2),
                'validated_total' => round($summary['validated_total'], 2),
                'paid_total' => round($summary['paid_total'], 2),
            ],
        ]);
    }
}
