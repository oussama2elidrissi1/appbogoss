<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Services\CustomerRegistrationService;
use App\Services\LoyaltySettingsService;
use App\Services\PhoneNumberNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Public, unauthenticated registration surface reached by scanning the
 * salon's general QR code — no "carte de fidélité" concept anywhere, this
 * only ever creates/looks up a CustomerLoyaltyAccount.
 */
class JoinController extends Controller
{
    public function __construct(
        private readonly CustomerRegistrationService $registrationService,
        private readonly LoyaltySettingsService $settings,
    ) {
    }

    public function status(Request $request): JsonResponse
    {
        $enabled = (bool) $this->settings->get('loyalty_qr_registration_enabled', true);
        $token = $this->settings->get('loyalty_qr_token');
        $providedToken = (string) $request->query('t', '');

        $valid = $enabled && $token !== null && $providedToken !== '' && hash_equals((string) $token, $providedToken);

        return response()->json(['data' => [
            'available' => $valid,
        ]]);
    }

    public function register(Request $request): JsonResponse
    {
        $this->assertRegistrationOpen($request);

        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'birth_date' => ['nullable', 'date', 'before:today'],
            'gender' => ['nullable', Rule::in(['female', 'male', 'other'])],
            'terms_consent' => ['accepted'],
            'marketing_consent' => ['nullable', 'boolean'],
        ]);

        $phoneE164 = PhoneNumberNormalizer::toE164($validated['phone']);
        if ($phoneE164 === null) {
            throw ValidationException::withMessages(['phone' => 'Numéro de téléphone invalide.']);
        }

        $result = $this->registrationService->register($validated, $phoneE164);

        return response()->json([
            'data' => [
                'status' => $result['already_existed'] ? 'existing' : 'created',
                'phone' => $validated['phone'],
            ],
        ], $result['already_existed'] ? 200 : 201);
    }

    private function assertRegistrationOpen(Request $request): void
    {
        $enabled = (bool) $this->settings->get('loyalty_qr_registration_enabled', true);
        $token = $this->settings->get('loyalty_qr_token');
        $providedToken = (string) $request->input('token', '');

        if (! $enabled || $token === null || $providedToken === '' || ! hash_equals((string) $token, $providedToken)) {
            throw ValidationException::withMessages([
                'token' => 'Les inscriptions ne sont pas disponibles actuellement.',
            ]);
        }
    }
}
