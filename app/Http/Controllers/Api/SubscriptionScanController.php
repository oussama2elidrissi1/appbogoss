<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClientSubscription;
use App\Models\ClientSubscriptionUsage;
use App\Models\Employee;
use App\Models\SubscriptionPlanService;
use App\Services\PrestationService;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * QR scanning surface for the caisse: resolve a subscription's secure token
 * into a full "fiche abonnement" (never consuming anything), then validate a
 * visit explicitly. Validation runs the real Prestation pipeline end to end —
 * the visit lands in the caisse as a 0 DH Sale (payment_method "abonnement"),
 * commissions resolve through the plan's per-service commission basis, and
 * the employee's report picks the line up like any other prestation.
 */
class SubscriptionScanController extends Controller
{
    public function __construct(
        private readonly SubscriptionService $subscriptionService,
        private readonly PrestationService $prestationService,
    ) {
    }

    public function show(string $token): JsonResponse
    {
        $subscription = $this->subscriptionService->resolveByToken($token);

        if ($subscription === null) {
            return response()->json(['message' => 'QR code invalide ou révoqué.'], 404);
        }

        return response()->json(['data' => $this->card($subscription)]);
    }

    public function validateVisit(Request $request, string $token): JsonResponse
    {
        $subscription = $this->subscriptionService->resolveByToken($token);

        if ($subscription === null) {
            return response()->json(['message' => 'QR code invalide ou révoqué.'], 404);
        }

        $validated = $request->validate([
            'subscription_plan_service_id' => [
                'required',
                'integer',
                Rule::exists('subscription_plan_services', 'id')
                    ->where('subscription_plan_id', $subscription->subscription_plan_id),
            ],
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')],
            'notes' => ['nullable', 'string', 'max:500'],
        ], [
            'subscription_plan_service_id.exists' => 'Ce service n’est pas inclus dans cet abonnement.',
        ]);

        $planService = SubscriptionPlanService::with('service')->findOrFail($validated['subscription_plan_service_id']);
        $employee = Employee::findOrFail($validated['employee_id']);
        $actor = $request->user();

        // One outer transaction so a failure at any stage (rule refused,
        // payment glitch…) leaves zero trace — no orphan prestation, no
        // half-consumed visit. Inner service transactions become savepoints.
        $paid = DB::transaction(function () use ($subscription, $planService, $employee, $actor, $validated) {
            $prestation = $this->prestationService->create([
                'client_id' => $subscription->client_id,
                'notes' => $validated['notes'] ?? null,
                'items' => [[
                    'service_id' => $planService->service_id,
                    'client_subscription_id' => $subscription->id,
                    'subscription_plan_service_id' => $planService->id,
                    'usage_channel' => 'scanner',
                ]],
            ], $employee, $actor);

            $prestation = $this->prestationService->markServicesDone($prestation, $actor);
            $prestation = $this->prestationService->sendToCaisse($prestation, $actor, notify: false);

            return $this->prestationService->confirmPayment($prestation, ['payment_method' => 'abonnement'], $actor);
        });

        $subscription = $subscription->fresh(['client', 'plan.services.service']);
        $remaining = $this->subscriptionService->quotaRemaining($subscription, $planService);

        return response()->json(['data' => [
            'validated' => true,
            'prestation_id' => $paid->id,
            'sale_id' => $paid->sale_id,
            'service_name' => $planService->service?->name,
            'remaining' => $remaining,
            'card' => $this->card($subscription),
        ]]);
    }

    /**
     * The full scan card — everything the caisse needs to decide, without
     * consuming anything.
     *
     * @return array<string, mixed>
     */
    private function card(ClientSubscription $subscription): array
    {
        $subscription->loadMissing(['client', 'plan.services.service']);

        $blockReason = $this->subscriptionService->usabilityBlockReason($subscription);
        $usable = $blockReason === null;

        $rules = $this->subscriptionService->usageRuleStatus($subscription);

        $usedVisits = ClientSubscriptionUsage::where('client_subscription_id', $subscription->id)
            ->whereIn('status', [ClientSubscriptionUsage::STATUS_RESERVED, ClientSubscriptionUsage::STATUS_CONFIRMED])
            ->count();

        $quotaTotals = $subscription->plan?->services->pluck('quota_total');
        $totalVisits = $quotaTotals !== null && $quotaTotals->isNotEmpty() && ! $quotaTotals->contains(null)
            ? (int) $quotaTotals->sum()
            : null;

        $services = ($subscription->plan?->services ?? collect())->map(function (SubscriptionPlanService $planService) use ($subscription) {
            $remaining = $this->subscriptionService->quotaRemaining($subscription, $planService);

            return [
                'plan_service_id' => $planService->id,
                'service_id' => $planService->service_id,
                'name' => $planService->service?->name ?? 'Service',
                'price' => (float) ($planService->service?->price ?? 0),
                'duration_minutes' => $planService->service?->duration_minutes,
                'quota_period' => $planService->quota_period,
                'quota_per_period' => $planService->quota_per_period,
                'period_remaining' => $remaining['period_remaining'],
                'quota_total' => $planService->quota_total,
                'total_remaining' => $remaining['total_remaining'],
                'unlimited' => $planService->quota_per_period === null && $planService->quota_total === null,
            ];
        })->values()->all();

        $recentUsages = ClientSubscriptionUsage::where('client_subscription_id', $subscription->id)
            ->whereIn('status', [ClientSubscriptionUsage::STATUS_RESERVED, ClientSubscriptionUsage::STATUS_CONFIRMED])
            ->with(['planService.service', 'employee'])
            ->orderByDesc('used_at')
            ->limit(8)
            ->get()
            ->map(fn (ClientSubscriptionUsage $usage) => [
                'used_at' => $usage->used_at?->toIso8601String() ?? $usage->used_on?->toIso8601String(),
                'service_name' => $usage->planService?->service?->name ?? 'Service',
                'employee_name' => $usage->employee?->name,
                'channel' => $usage->channel,
                'status' => $usage->status,
            ])
            ->all();

        return [
            'subscription' => [
                'id' => $subscription->id,
                'status' => $subscription->status,
                'starts_on' => $subscription->starts_on->toDateString(),
                'ends_on' => $subscription->ends_on->toDateString(),
                'purchased_at' => $subscription->purchased_at?->toIso8601String(),
                'suspension_ends_on' => $subscription->suspension_ends_on?->toDateString(),
                'renewable' => (bool) ($subscription->plan?->allow_renewal),
            ],
            'plan' => [
                'id' => $subscription->plan?->id,
                'name' => $subscription->plan?->name ?? 'Abonnement',
                'description' => $subscription->plan?->description,
                'price' => (float) ($subscription->plan?->price ?? 0),
            ],
            'client' => [
                'id' => $subscription->client?->id,
                'name' => $subscription->client?->name ?? 'Client',
                'phone' => $subscription->client?->phone,
                'avatar_color' => $subscription->client?->avatar_color,
            ],
            'usable' => $usable,
            'block_reason' => $blockReason,
            'rules' => $rules,
            'used_visits' => $usedVisits,
            'total_visits' => $totalVisits,
            'services' => $services,
            'recent_usages' => $recentUsages,
        ];
    }
}
