<?php

namespace App\Http\Controllers\Api\PosV2;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\LoyaltyReward;
use App\Services\LoyaltyEngine;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;

/**
 * Everything the caisse needs the moment a client is selected (§14-§18):
 * loyalty points, usable rewards, and every ACTIVE subscription with its
 * per-service quotas, live usability verdict, and — new in V2 — its money
 * position (total / payé / reste, §16-§17). Mirrors
 * ClientLoyaltyStatusController's shapes so the redemption payloads stay
 * identical to V1's, then extends them.
 */
class PosClientContextController extends Controller
{
    public function __invoke(
        Client $client,
        SubscriptionService $subscriptionService,
        LoyaltyEngine $loyaltyEngine,
    ): JsonResponse {
        $account = $loyaltyEngine->ensureLoyaltyAccount($client);

        $rewards = LoyaltyReward::where('client_id', $client->id)
            ->where('status', LoyaltyReward::STATUS_AVAILABLE)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->with(['service:id,name,price', 'program:id,name'])
            ->orderByDesc('generated_at')
            ->get()
            ->map(fn (LoyaltyReward $reward) => [
                'id' => $reward->id,
                'program_name' => $reward->program?->name,
                'type' => $reward->type,
                'service_id' => $reward->service_id,
                'service_name' => $reward->service?->name,
                'value' => $reward->value !== null ? (float) $reward->value : null,
                'expires_at' => $reward->expires_at?->toDateString(),
            ]);

        $subscriptions = ClientSubscription::where('client_id', $client->id)
            ->where('status', ClientSubscription::STATUS_ACTIVE)
            ->with(['plan.services.service'])
            ->orderByDesc('purchased_at')
            ->get()
            ->map(function (ClientSubscription $subscription) use ($subscriptionService) {
                $payment = $subscriptionService->paymentStatus($subscription);
                $plan = $subscription->plan;

                return [
                    'id' => $subscription->id,
                    'plan_id' => $subscription->subscription_plan_id,
                    'plan_name' => $plan?->name,
                    'starts_on' => $subscription->starts_on?->toDateString(),
                    'ends_on' => $subscription->ends_on?->toDateString(),
                    'usable' => $subscriptionService->usabilityBlockReason($subscription) === null,
                    'block_reason' => $subscriptionService->usabilityBlockReason($subscription),
                    'rules' => $subscriptionService->usageRuleStatus($subscription),
                    'payment' => [
                        'total' => $payment['total'],
                        'paid' => $payment['paid'],
                        'remaining' => $payment['remaining'],
                    ],
                    'services' => $plan?->services->map(function ($planService) use ($subscription, $subscriptionService) {
                        $quota = $subscriptionService->quotaRemaining($subscription, $planService);

                        return [
                            'subscription_plan_service_id' => $planService->id,
                            'service_id' => $planService->service_id,
                            'service_name' => $planService->service?->name,
                            'public_price' => $planService->service?->price !== null
                                ? (float) $planService->service->price
                                : null,
                            'period_remaining' => $quota['period_remaining'],
                            'total_remaining' => $quota['total_remaining'],
                            'unlimited' => $planService->quota_per_period === null && $planService->quota_total === null,
                        ];
                    })->values() ?? [],
                ];
            });

        return response()->json(['data' => [
            'client' => [
                'id' => $client->id,
                'name' => $client->name,
                'phone' => $client->phone,
                'avatar_color' => $client->avatar_color,
                'notes' => $client->notes,
                'last_visit_at' => $client->last_visit_at?->toIso8601String(),
            ],
            'points_balance' => $account->points_balance,
            'rewards' => $rewards,
            'subscriptions' => $subscriptions,
        ]]);
    }
}
