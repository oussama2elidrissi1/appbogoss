<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Models\PartnerCommission;
use App\Services\PartnerCommissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin side of §21 — "Commissions partenaires": what's due, and marking a
 * selected set (or everything outstanding) as paid, recording how.
 */
class PartnerCommissionPayoutController extends Controller
{
    public function __construct(private readonly PartnerCommissionService $commissionService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'partner_id' => ['nullable', 'integer', 'exists:partners,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $query = PartnerCommission::where('status', PartnerCommission::STATUS_VALIDATED)
            ->with(['partner', 'client', 'service'])
            ->orderByDesc('created_at');

        if (! empty($validated['partner_id'])) {
            $query->where('partner_id', $validated['partner_id']);
        }
        if (! empty($validated['from'])) {
            $query->whereDate('created_at', '>=', $validated['from']);
        }
        if (! empty($validated['to'])) {
            $query->whereDate('created_at', '<=', $validated['to']);
        }

        $rows = $query->get();

        return response()->json([
            'data' => $rows->map(fn (PartnerCommission $commission) => [
                'id' => $commission->id,
                'partner_id' => $commission->partner_id,
                'partner_name' => $commission->partner?->name,
                'client_name' => $commission->client?->name,
                'service_name' => $commission->service?->name,
                'base_amount' => (float) $commission->base_amount,
                'amount' => (float) $commission->amount,
                'created_at' => $commission->created_at?->toIso8601String(),
            ])->values(),
            'meta' => [
                'total_due' => round((float) $rows->sum('amount'), 2),
                'by_partner' => $rows->groupBy('partner_id')->map(fn ($group) => [
                    'partner_id' => $group->first()->partner_id,
                    'partner_name' => $group->first()->partner?->name,
                    'total' => round((float) $group->sum('amount'), 2),
                    'count' => $group->count(),
                ])->values(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'partner_id' => ['required', 'integer', 'exists:partners,id'],
            'commission_ids' => ['nullable', 'array'],
            'commission_ids.*' => ['integer'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $partner = Partner::findOrFail($validated['partner_id']);

        $payout = $this->commissionService->pay(
            $partner,
            $validated['commission_ids'] ?? null,
            $request->user(),
            $validated['payment_method'] ?? null,
            $validated['reference'] ?? null,
            $validated['notes'] ?? null,
        );

        return response()->json(['data' => [
            'id' => $payout->id,
            'partner_id' => $payout->partner_id,
            'amount' => (float) $payout->amount,
            'payment_method' => $payout->payment_method,
            'reference' => $payout->reference,
            'paid_at' => $payout->paid_at->toIso8601String(),
            'paid_by' => $request->user()->name,
            'notes' => $payout->notes,
            'commissions_count' => $payout->commissions()->count(),
        ]], 201);
    }
}
