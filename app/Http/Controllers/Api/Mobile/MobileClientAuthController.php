<?php

namespace App\Http\Controllers\Api\Mobile;

use App\Http\Controllers\Controller;
use App\Http\Resources\PortalClientResource;
use App\Models\Client;
use App\Services\ActivityLogger;
use App\Services\PhoneNumberNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Customer ("Mon BOGOSLAND") authentication for the Flutter app — phone +
 * the password chosen at /join, same credentials as the web portal.
 *
 * Mirrors App\Http\Controllers\Api\Public\ClientLoginController rather than
 * refactoring it: that controller is the live web login path, and the brief
 * for this phase is that the web keeps behaving exactly as before. The one
 * thing deliberately SHARED with it is the rate-limiter key — see below.
 *
 * Registration is intentionally not offered here. Signing up still goes
 * through the salon's QR code (/api/public/join), which is gated on the
 * loyalty_qr_registration_enabled setting and its rotating token; exposing an
 * unauthenticated account-creation endpoint to the open internet is a product
 * decision, not a mechanical port.
 */
class MobileClientAuthController extends Controller
{
    private const MAX_ATTEMPTS = 5;

    private const LOCKOUT_SECONDS = 300;

    public function __construct(private readonly ActivityLogger $activityLogger) {}

    /**
     * POST /api/mobile/client/login — phone + password, returns a bearer token.
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:30'],
            'password' => ['required', 'string'],
        ]);

        $phoneE164 = PhoneNumberNormalizer::toE164($validated['phone']);
        if ($phoneE164 === null) {
            throw ValidationException::withMessages(['phone' => 'Numéro de téléphone invalide.']);
        }

        // Same key as ClientLoginController on purpose: one lockout budget per
        // phone number across both surfaces. A separate key would hand an
        // attacker twice the attempts simply by alternating web and mobile.
        $lockoutKey = "client-login:{$phoneE164}";
        if (RateLimiter::tooManyAttempts($lockoutKey, self::MAX_ATTEMPTS)) {
            throw ValidationException::withMessages([
                'phone' => 'Trop de tentatives. Réessayez plus tard.',
            ]);
        }

        $client = Client::where('phone_e164', $phoneE164)->first();

        if ($client === null || $client->password === null || ! Hash::check($validated['password'], $client->password)) {
            RateLimiter::hit($lockoutKey, self::LOCKOUT_SECONDS);

            // One generic message regardless of which check failed, so the
            // endpoint cannot be used to enumerate which phone numbers belong
            // to customers.
            throw ValidationException::withMessages([
                'phone' => 'Numéro ou mot de passe incorrect.',
            ]);
        }

        RateLimiter::clear($lockoutKey);

        $token = $client->createToken($this->deviceName($request))->plainTextToken;

        $this->activityLogger->log('loyalty.customer_mobile_login', $client);

        return response()->json([
            'token' => $token,
            'type' => 'client',
            'account' => new PortalClientResource($client),
        ]);
    }

    private function deviceName(Request $request): string
    {
        $name = trim((string) $request->input('device_name', ''));

        return $name !== '' ? mb_substr($name, 0, 100) : 'mobile';
    }
}
