<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ClientSubscriptionResource;
use App\Models\Client;
use App\Models\SubscriptionPlan;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Sells a subscription plan to a client — from the caisse, the client sheet,
 * or the (future) Subscriptions module, all the same single action.
 */
class SubscriptionPurchaseController extends Controller
{
    public function __construct(private readonly SubscriptionService $subscriptionService)
    {
    }

    public function __invoke(Request $request, Client $client): JsonResponse
    {
        $validated = $request->validate([
            'subscription_plan_id' => ['required', 'integer', 'exists:subscription_plans,id'],
            'payment_method' => ['nullable', 'string', Rule::in(['especes', 'carte', 'virement', 'mixte', 'autre'])],
            'starts_on' => ['nullable', 'date'],
        ]);

        $plan = SubscriptionPlan::findOrFail($validated['subscription_plan_id']);

        $subscription = $this->subscriptionService->purchase($client, $plan, $request->user(), $validated);

        return response()->json(['data' => new ClientSubscriptionResource($subscription)], 201);
    }
}
