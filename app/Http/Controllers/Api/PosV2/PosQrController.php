<?php

namespace App\Http\Controllers\Api\PosV2;

use App\Http\Controllers\Controller;
use App\Models\ClientQrToken;
use App\Services\LoyaltySettingsService;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * §20 — one scan entry point for the caisse. A QR only ever contains a
 * random token (never client data); this endpoint figures out which of the
 * two token families it belongs to:
 *  - client identity token (client_qr_tokens, gated by the same
 *    loyalty_personal_qr_enabled setting as ClientQrController::lookup);
 *  - subscription card token (client_subscriptions.qr_token).
 */
class PosQrController extends Controller
{
    public function __invoke(
        Request $request,
        SubscriptionService $subscriptionService,
        LoyaltySettingsService $settings,
    ): JsonResponse {
        $validated = $request->validate(['token' => ['required', 'string', 'max:191']]);
        $token = trim($validated['token']);

        // Subscription QR — payload sometimes arrives as a URL; keep the
        // last path segment, same normalisation the scanner page applies.
        $candidate = str_contains($token, '/') ? basename(parse_url($token, PHP_URL_PATH) ?: $token) : $token;

        $subscription = $subscriptionService->resolveByToken($candidate);
        if ($subscription !== null) {
            return response()->json(['data' => [
                'type' => 'subscription',
                'client_subscription_id' => $subscription->id,
                'client' => [
                    'id' => $subscription->client?->id,
                    'name' => $subscription->client?->name,
                    'phone' => $subscription->client?->phone,
                    'avatar_color' => $subscription->client?->avatar_color,
                ],
                'plan_name' => $subscription->plan?->name,
                'status' => $subscription->status,
            ]]);
        }

        if ($settings->get('loyalty_personal_qr_enabled', false)) {
            $clientToken = ClientQrToken::where('token', $candidate)
                ->whereNull('revoked_at')
                ->with('client')
                ->first();
            if ($clientToken?->client !== null) {
                return response()->json(['data' => [
                    'type' => 'client',
                    'client' => [
                        'id' => $clientToken->client->id,
                        'name' => $clientToken->client->name,
                        'phone' => $clientToken->client->phone,
                        'avatar_color' => $clientToken->client->avatar_color,
                    ],
                ]]);
            }
        }

        return response()->json(['message' => 'QR non reconnu.'], 404);
    }
}
