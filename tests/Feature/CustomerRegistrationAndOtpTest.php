<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\CustomerOtpCode;
use App\Services\CustomerRegistrationService;
use App\Services\LoyaltySettingsService;
use App\Services\Otp\OtpService;
use App\Services\PhoneNumberNormalizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * §36 — registration dedup (phone normalization) and OTP edge cases
 * (expiration, wrong code, reuse, rate limiting), exercised at the service
 * layer directly — CustomerPortalAuthTest already covers the real HTTP path
 * end to end, this file focuses on the invariants underneath it.
 */
class CustomerRegistrationAndOtpTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_registering_twice_with_equivalent_phone_formats_never_creates_a_duplicate_client(): void
    {
        $service = app(CustomerRegistrationService::class);

        $first = $service->register([
            'first_name' => 'Sara',
            'last_name' => 'Amrani',
            'phone' => '0612345678',
            'terms_consent' => true,
        ], '+212612345678');
        $this->assertFalse($first['already_existed']);

        // Same person, phone typed differently the second time (e.g. re-scanning
        // the QR at a later visit) — must resolve to the exact same client.
        $second = $service->register([
            'first_name' => 'Sara',
            'last_name' => 'Amrani',
            'phone' => '06 12 34 56 78',
            'terms_consent' => true,
        ], PhoneNumberNormalizer::toE164('06 12 34 56 78'));
        $this->assertTrue($second['already_existed']);
        $this->assertSame($first['client']->id, $second['client']->id);

        $this->assertSame(1, Client::where('phone_e164', '+212612345678')->count());
    }

    public function test_otp_verify_fails_with_wrong_code_and_increments_attempts(): void
    {
        $client = Client::factory()->create(['phone_e164' => '+212612345678']);
        $otpService = app(OtpService::class);
        $result = $otpService->requestCode('+212612345678', '127.0.0.1');
        $this->assertNotNull($result['dev_code']);

        $this->expectException(ValidationException::class);
        try {
            $otpService->verifyCode('+212612345678', '000001');
        } finally {
            $otp = CustomerOtpCode::where('phone_e164', '+212612345678')->latest('id')->first();
            $this->assertSame(1, $otp->attempts);
            $this->assertNull($otp->consumed_at);
        }
    }

    public function test_otp_verify_succeeds_with_the_correct_code_and_consumes_it(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678']);
        $otpService = app(OtpService::class);
        $result = $otpService->requestCode('+212612345678', '127.0.0.1');

        $otpService->verifyCode('+212612345678', $result['dev_code']);

        $otp = CustomerOtpCode::where('phone_e164', '+212612345678')->latest('id')->first();
        $this->assertNotNull($otp->consumed_at);
    }

    public function test_a_consumed_otp_code_cannot_be_reused(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678']);
        $otpService = app(OtpService::class);
        $result = $otpService->requestCode('+212612345678', '127.0.0.1');
        $otpService->verifyCode('+212612345678', $result['dev_code']);

        $this->expectException(ValidationException::class);
        $otpService->verifyCode('+212612345678', $result['dev_code']);
    }

    public function test_an_expired_otp_code_is_rejected(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678']);
        app(LoyaltySettingsService::class)->set(['otp_ttl_seconds' => 1]);
        $otpService = app(OtpService::class);
        $result = $otpService->requestCode('+212612345678', '127.0.0.1');

        $this->travel(2)->seconds();

        $this->expectException(ValidationException::class);
        $otpService->verifyCode('+212612345678', $result['dev_code']);
    }

    public function test_otp_verify_locks_out_after_max_attempts(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678']);
        app(LoyaltySettingsService::class)->set(['otp_max_attempts' => 2]);
        $otpService = app(OtpService::class);
        $otpService->requestCode('+212612345678', '127.0.0.1');

        foreach (range(1, 2) as $_) {
            try {
                $otpService->verifyCode('+212612345678', '000001');
            } catch (ValidationException) {
                // expected — wrong code, still under the attempt cap
            }
        }

        // Third attempt: attempts (2) >= max_attempts (2) — locked out even
        // before the code is compared.
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('Trop de tentatives. Demandez un nouveau code.');
        $otpService->verifyCode('+212612345678', '000001');
    }

    public function test_otp_resend_is_blocked_during_the_cooldown_window(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678']);
        $otpService = app(OtpService::class);
        $otpService->requestCode('+212612345678', '127.0.0.1');

        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('Veuillez patienter avant de redemander un code.');
        $otpService->requestCode('+212612345678', '127.0.0.1');
    }

    public function test_requesting_a_new_code_invalidates_the_previous_one(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678']);
        app(LoyaltySettingsService::class)->set(['otp_resend_cooldown_seconds' => 0]);
        $otpService = app(OtpService::class);

        $first = $otpService->requestCode('+212612345678', '127.0.0.1');
        $otpService->requestCode('+212612345678', '127.0.0.1');

        $this->expectException(ValidationException::class);
        $otpService->verifyCode('+212612345678', $first['dev_code']);
    }
}
