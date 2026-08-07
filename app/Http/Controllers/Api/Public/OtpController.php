<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\PortalClientResource;
use App\Models\Client;
use App\Services\ActivityLogger;
use App\Services\Otp\OtpService;
use App\Services\PhoneNumberNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

/**
 * Phone + OTP — the customer portal's only authentication method, used both
 * right after /join (to verify the phone that was just registered) and for
 * every later "Mon BOGOSLAND" login. No password ever exists for a Client.
 */
class OtpController extends Controller
{
    public function __construct(
        private readonly OtpService $otpService,
        private readonly ActivityLogger $activityLogger,
    ) {
    }

    public function request(Request $request): JsonResponse
    {
        $validated = $request->validate(['phone' => ['required', 'string', 'max:30']]);
        $phoneE164 = $this->normalizedPhone($validated['phone']);

        $result = $this->otpService->requestCode($phoneE164, $request->ip() ?? '0.0.0.0');

        return response()->json(['data' => [
            'expires_at' => $result['expires_at']->toIso8601String(),
            // Only non-null with the dev "log" provider (no real SMS/WhatsApp
            // gateway configured) — never populated once a real provider is bound.
            'dev_code' => $result['dev_code'],
        ]]);
    }

    public function verify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:30'],
            'code' => ['required', 'string', 'size:6'],
        ]);
        $phoneE164 = $this->normalizedPhone($validated['phone']);

        $this->otpService->verifyCode($phoneE164, $validated['code']);

        $client = Client::where('phone_e164', $phoneE164)->first();
        if ($client === null) {
            throw ValidationException::withMessages([
                'phone' => 'Aucun compte trouvé pour ce numéro. Inscrivez-vous d’abord.',
            ]);
        }

        if ($client->phone_verified_at === null) {
            $client->update(['phone_verified_at' => now()]);
        }

        // No `remember` flag: Client has no remember_token column (there's
        // no "remember me" concept for a phone+OTP session), and passing
        // true here would make SessionGuard try to write one and fatal.
        Auth::guard('client')->login($client);
        $request->session()->regenerate();

        $this->activityLogger->log('loyalty.customer_login', $client);

        return response()->json(['data' => new PortalClientResource($client)]);
    }

    private function normalizedPhone(string $raw): string
    {
        $phoneE164 = PhoneNumberNormalizer::toE164($raw);
        if ($phoneE164 === null) {
            throw ValidationException::withMessages(['phone' => 'Numéro de téléphone invalide.']);
        }

        return $phoneE164;
    }
}
