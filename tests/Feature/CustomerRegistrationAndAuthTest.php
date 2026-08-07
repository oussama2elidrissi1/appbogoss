<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Services\CustomerRegistrationService;
use App\Services\LoyaltySettingsService;
use App\Services\PhoneNumberNormalizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * §36 — registration dedup (phone normalization), password hashing, the
 * "existing phone can't be silently re-registered into" security fix, and
 * phone+password login (success, wrong password, lockout). CustomerPortalAuthTest
 * covers the real HTTP round trip end to end; this file focuses on the
 * invariants underneath it.
 */
class CustomerRegistrationAndAuthTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost';

    public function test_phone_variants_normalize_to_the_same_e164_identity(): void
    {
        $this->assertSame('+212612345678', PhoneNumberNormalizer::toE164('0612345678'));
        $this->assertSame('+212612345678', PhoneNumberNormalizer::toE164('+212612345678'));
        $this->assertSame('+212612345678', PhoneNumberNormalizer::toE164('212612345678'));
        $this->assertSame('+212612345678', PhoneNumberNormalizer::toE164('06 12 34 56 78'));
        $this->assertSame('+212612345678', PhoneNumberNormalizer::toE164('06-12-34-56-78'));
    }

    public function test_invalid_phone_numbers_are_rejected(): void
    {
        $this->assertNull(PhoneNumberNormalizer::toE164('123'));
        $this->assertNull(PhoneNumberNormalizer::toE164('0412345678')); // starts with 4 — not a valid MA prefix
        $this->assertNull(PhoneNumberNormalizer::toE164('abcdefghij'));
    }

    public function test_registration_stores_a_hashed_password_that_can_be_verified(): void
    {
        $service = app(CustomerRegistrationService::class);

        $result = $service->register([
            'first_name' => 'Sara',
            'last_name' => 'Amrani',
            'phone' => '0612345678',
            'password' => 'motdepasse123',
            'terms_consent' => true,
        ], '+212612345678');

        $this->assertFalse($result['already_existed']);
        $client = $result['client']->fresh();
        $this->assertNotSame('motdepasse123', $client->password, 'Password must never be stored in plaintext.');
        $this->assertTrue(Hash::check('motdepasse123', $client->password));
    }

    public function test_registering_with_an_existing_phone_number_is_rejected_not_silently_logged_in(): void
    {
        $token = app(LoyaltySettingsService::class)->ensureQrToken();

        // Created directly (not via HTTP), so this test's cookie jar starts
        // with no session at all — simulating an attacker who has never
        // authenticated as anyone, not even as the account they're targeting.
        Client::factory()->create(['phone_e164' => '+212612345678', 'password' => 'motdepasse123']);

        // Anyone can type an existing customer's phone number — this must
        // never grant access to that account (§31: it would be an account
        // takeover if it logged the caller in as the existing client).
        $response = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/join', [
            'first_name' => 'Intrus', 'last_name' => 'Inconnu', 'phone' => '0612345678',
            'password' => 'autre-mot-de-passe', 'password_confirmation' => 'autre-mot-de-passe',
            'terms_consent' => true, 'token' => $token,
        ]);
        $response->assertUnprocessable();

        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertUnauthorized();
        $this->assertSame(1, Client::where('phone_e164', '+212612345678')->count());
    }

    public function test_login_fails_with_a_generic_message_when_the_phone_has_no_account(): void
    {
        $response = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/login', [
            'phone' => '0699999999',
            'password' => 'whatever123',
        ]);
        $response->assertUnprocessable();
        $response->assertJsonPath('errors.phone.0', 'Numéro ou mot de passe incorrect.');
    }

    public function test_login_fails_with_the_same_generic_message_on_a_wrong_password(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678', 'password' => 'motdepasse123']);

        $response = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/login', [
            'phone' => '0612345678',
            'password' => 'wrong-password',
        ]);
        $response->assertUnprocessable();
        $response->assertJsonPath('errors.phone.0', 'Numéro ou mot de passe incorrect.');
    }

    public function test_login_locks_out_after_repeated_failed_attempts_on_the_same_phone(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678', 'password' => 'motdepasse123']);

        for ($i = 0; $i < 5; $i++) {
            $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/login', [
                'phone' => '0612345678',
                'password' => 'wrong-password',
            ])->assertUnprocessable();
        }

        // 6th attempt, even with the correct password — locked out.
        $response = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/login', [
            'phone' => '0612345678',
            'password' => 'motdepasse123',
        ]);
        $response->assertUnprocessable();
        $response->assertJsonPath('errors.phone.0', 'Trop de tentatives. Réessayez plus tard.');
    }
}
