<?php

namespace App\Http\Controllers\Api\PosV2;

use App\Http\Controllers\Controller;
use App\Models\ClientSubscription;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * §16-§17 — installments on a partially-paid subscription, collected at the
 * caisse. Reading the position needs caisse_v2.access (route group); moving
 * money needs caisse_v2.checkout, same split as invoices.
 */
class PosSubscriptionPaymentController extends Controller
{
    public function __construct(private readonly SubscriptionService $subscriptions) {}

    public function index(ClientSubscription $clientSubscription): JsonResponse
    {
        return response()->json(['data' => $this->subscriptions->paymentStatus($clientSubscription)]);
    }

    public function store(Request $request, ClientSubscription $clientSubscription): JsonResponse
    {
        if (! $request->user()->can('caisse_v2.checkout')) {
            return response()->json(['message' => 'Vous n’êtes pas autorisé à encaisser.'], 403);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:999999'],
            'payment_method' => ['required', 'string', 'in:especes,carte,virement,autre'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $this->subscriptions->recordPayment(
            $clientSubscription,
            (float) $validated['amount'],
            $validated['payment_method'],
            $request->user(),
            $validated['notes'] ?? null,
        );

        return response()->json([
            'data' => $this->subscriptions->paymentStatus($clientSubscription->fresh()),
        ], 201);
    }
}
