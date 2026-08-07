<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientQrToken;
use App\Services\ActivityLogger;
use App\Services\LoyaltySettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Personal identification QR (§10) — never a loyalty card. The QR encodes
 * only a random token; scanning it (POST /api/qr/lookup) resolves to a
 * client id/name so the caisse/employee UI can select the right cart, and
 * nothing else is ever exposed through the token itself.
 */
class ClientQrController extends Controller
{
    public function __construct(
        private readonly ActivityLogger $activityLogger,
        private readonly LoyaltySettingsService $settings,
    ) {
    }

    public function show(Client $client): JsonResponse
    {
        $token = ClientQrToken::where('client_id', $client->id)->whereNull('revoked_at')->first();

        return response()->json(['data' => [
            'enabled' => (bool) $this->settings->get('loyalty_personal_qr_enabled', true),
            'token' => $token?->token,
        ]]);
    }

    public function regenerate(Client $client): JsonResponse
    {
        ClientQrToken::where('client_id', $client->id)->whereNull('revoked_at')->update(['revoked_at' => now()]);

        $token = ClientQrToken::create([
            'client_id' => $client->id,
            'token' => Str::random(48),
        ]);

        $this->activityLogger->log('loyalty.client_qr_regenerated', $client);

        return response()->json(['data' => ['token' => $token->token]]);
    }

    public function revoke(Client $client): JsonResponse
    {
        ClientQrToken::where('client_id', $client->id)->whereNull('revoked_at')->update(['revoked_at' => now()]);

        $this->activityLogger->log('loyalty.client_qr_revoked', $client);

        return response()->json(null, 204);
    }

    public function lookup(Request $request): JsonResponse
    {
        if (! $this->settings->get('loyalty_personal_qr_enabled', true)) {
            throw ValidationException::withMessages(['token' => 'L’identification par QR est désactivée.']);
        }

        $validated = $request->validate(['token' => ['required', 'string']]);

        $qrToken = ClientQrToken::where('token', $validated['token'])->whereNull('revoked_at')->first();
        if ($qrToken === null) {
            throw ValidationException::withMessages(['token' => 'QR invalide ou révoqué.']);
        }

        $client = $qrToken->client;

        return response()->json(['data' => [
            'client_id' => $client->id,
            'name' => $client->name,
            'phone' => $client->phone,
        ]]);
    }
}
