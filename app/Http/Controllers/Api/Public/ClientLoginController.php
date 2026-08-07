<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\PortalClientResource;
use App\Models\Client;
use App\Services\ActivityLogger;
use App\Services\PhoneNumberNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Returning-customer login for the portal — phone + the password chosen at
 * /join. Same generic-failure-message and per-phone lockout shape as
 * App\Services\Otp\OtpService, so a wrong guess never reveals whether the
 * phone number itself belongs to a customer.
 */
class ClientLoginController extends Controller
{
    private const MAX_ATTEMPTS = 5;

    private const LOCKOUT_SECONDS = 300;

    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

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

        $lockoutKey = "client-login:{$phoneE164}";
        if (RateLimiter::tooManyAttempts($lockoutKey, self::MAX_ATTEMPTS)) {
            throw ValidationException::withMessages([
                'phone' => 'Trop de tentatives. Réessayez plus tard.',
            ]);
        }

        $client = Client::where('phone_e164', $phoneE164)->first();

        if ($client === null || $client->password === null || ! Hash::check($validated['password'], $client->password)) {
            RateLimiter::hit($lockoutKey, self::LOCKOUT_SECONDS);

            // One generic message regardless of which check failed — telling
            // the caller "no account for this phone" vs "wrong password"
            // would let anyone enumerate which phone numbers are customers.
            throw ValidationException::withMessages([
                'phone' => 'Numéro ou mot de passe incorrect.',
            ]);
        }

        RateLimiter::clear($lockoutKey);

        Auth::guard('client')->login($client);
        $request->session()->regenerate();
        $this->activityLogger->log('loyalty.customer_login', $client);

        return response()->json(['data' => new PortalClientResource($client)]);
    }
}
