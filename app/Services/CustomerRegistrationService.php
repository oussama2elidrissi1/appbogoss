<?php

namespace App\Services;

use App\Models\Client;
use Illuminate\Support\Facades\DB;

/**
 * Public self-registration (QR → /join). Phone is the identifier: an
 * existing phone_e164 never creates a second client record — the caller
 * (JoinController) surfaces "vous avez déjà un compte" instead.
 */
class CustomerRegistrationService
{
    public function __construct(
        private readonly LoyaltyEngine $loyaltyEngine,
        private readonly ActivityLogger $activityLogger,
        private readonly LoyaltyNotifier $notifier,
    ) {
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{client: Client, already_existed: bool}
     */
    public function register(array $data, string $phoneE164): array
    {
        $existing = Client::where('phone_e164', $phoneE164)->first();
        if ($existing !== null) {
            return ['client' => $existing, 'already_existed' => true];
        }

        $client = DB::transaction(function () use ($data, $phoneE164) {
            $client = Client::create([
                'name' => trim($data['first_name'].' '.$data['last_name']),
                'phone' => $data['phone'],
                'phone_e164' => $phoneE164,
                // Hashed automatically by Client's 'password' => 'hashed' cast.
                'password' => $data['password'],
                'email' => $data['email'] ?? null,
                'birth_date' => $data['birth_date'] ?? null,
                'gender' => $data['gender'] ?? null,
                'phone_verified_at' => now(),
                'registered_at' => now(),
                'consent_terms_at' => now(),
                'consent_marketing_at' => ! empty($data['marketing_consent']) ? now() : null,
            ]);

            $this->loyaltyEngine->ensureLoyaltyAccount($client);

            return $client;
        });

        $this->activityLogger->log('loyalty.customer_registered', $client, [], [
            'phone' => $phoneE164,
            'marketing_consent' => ! empty($data['marketing_consent']),
        ]);

        $this->notifier->notifyClient($client, 'welcome', [
            'first_name' => $data['first_name'],
        ]);

        return ['client' => $client, 'already_existed' => false];
    }
}
