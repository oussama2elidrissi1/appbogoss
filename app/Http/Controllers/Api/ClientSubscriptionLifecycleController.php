<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ClientSubscriptionResource;
use App\Models\ClientSubscription;
use App\Services\SubscriptionService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Super Admin subscription corrections (§11/§17/§18) — suspend/resume/
 * extend/renew all delegate to SubscriptionService, which is the single
 * source of truth already exercised by the purchase/usage flows.
 */
class ClientSubscriptionLifecycleController extends Controller
{
    public function __construct(private readonly SubscriptionService $subscriptionService)
    {
    }

    public function suspend(Request $request, ClientSubscription $clientSubscription): JsonResponse
    {
        $validated = $request->validate([
            'starts_on' => ['required', 'date'],
            'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $updated = $this->subscriptionService->suspend(
            $clientSubscription,
            Carbon::parse($validated['starts_on']),
            Carbon::parse($validated['ends_on']),
            $validated['reason'],
            $request->user(),
        );

        return response()->json(['data' => new ClientSubscriptionResource($updated->load(['plan', 'client']))]);
    }

    public function resume(Request $request, ClientSubscription $clientSubscription): JsonResponse
    {
        $updated = $this->subscriptionService->resume($clientSubscription, $request->user());

        return response()->json(['data' => new ClientSubscriptionResource($updated->load(['plan', 'client']))]);
    }

    public function extend(Request $request, ClientSubscription $clientSubscription): JsonResponse
    {
        $validated = $request->validate([
            'days' => ['required', 'integer', 'min:1', 'max:365'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $updated = $this->subscriptionService->extend($clientSubscription, $validated['days'], $validated['reason'], $request->user());

        return response()->json(['data' => new ClientSubscriptionResource($updated->load(['plan', 'client']))]);
    }

    public function renew(Request $request, ClientSubscription $clientSubscription): JsonResponse
    {
        $validated = $request->validate([
            'starts_on' => ['nullable', 'date'],
            'payment_method' => ['nullable', 'string'],
        ]);

        $renewed = $this->subscriptionService->renew($clientSubscription, $request->user(), $validated);

        return response()->json(['data' => new ClientSubscriptionResource($renewed->load(['plan', 'client']))], 201);
    }
}
