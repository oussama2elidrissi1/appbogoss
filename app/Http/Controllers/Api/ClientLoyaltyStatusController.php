<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\LoyaltyReward;
use App\Services\LoyaltyEngine;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;

/**
 * Read-only snapshot of a client's loyalty account for the cart-building UI
 * (NewPrestationPanel): points balance, rewards actually usable right now,
 * and active subscriptions with their quota remaining today. Gated by
 * loyalty.redeem — the same permission that lets someone actually apply
 * what this endpoint shows, so an employee never sees a client's status
 * without also being able to act on it.
 */
class ClientLoyaltyStatusController extends Controller
{
    public function __invoke(Client $client, SubscriptionService $subscriptionService, LoyaltyEngine $loyaltyEngine): JsonResponse
    {
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
                return [
                    'id' => $subscription->id,
                    'plan_id' => $subscription->subscription_plan_id,
                    'plan_name' => $subscription->plan?->name,
                    'ends_on' => $subscription->ends_on?->toDateString(),
                    'services' => $subscription->plan?->services->map(function ($planService) use ($subscription, $subscriptionService) {
                        $quota = $subscriptionService->quotaRemaining($subscription, $planService);

                        return [
                            'subscription_plan_service_id' => $planService->id,
                            'service_id' => $planService->service_id,
                            'service_name' => $planService->service?->name,
                            'period_remaining' => $quota['period_remaining'],
                            'total_remaining' => $quota['total_remaining'],
                        ];
                    })->values() ?? [],
                ];
            });

        return response()->json(['data' => [
            'client_id' => $client->id,
            'points_balance' => $account->points_balance,
            'rewards' => $rewards,
            'subscriptions' => $subscriptions,
        ]]);
    }
}
