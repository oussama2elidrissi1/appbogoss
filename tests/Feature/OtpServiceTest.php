<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\CustomerOtpCode;
use App\Services\LoyaltySettingsService;
use App\Services\Otp\OtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * OtpService itself is not wired into any customer-portal route anymore —
 * registration/login are phone + password (see CustomerRegistrationAndAuthTest,
 * ClientLoginControllerTest). It's kept, unused but intact, as the exact
 * infrastructure a future "mot de passe oublié" reset flow needs, so this
 * suite stays to make sure that infrastructure doesn't silently rot.
 */
class OtpServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_otp_verify_fails_with_wrong_code_and_increments_attempts(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678']);
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
