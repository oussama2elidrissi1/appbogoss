<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Services\LoyaltySettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Exercises the customer portal's real HTTP auth path end to end — join,
 * OTP request/verify, session cookie, portal access — through actual
 * requests rather than Sanctum::actingAs(), which bypasses the
 * EnsureFrontendRequestsAreStateful / session-cookie mechanics entirely and
 * would silently hide a broken guard config or a mis-set stateful-domain
 * list. A `Referer` header simulates a real browser request from the SPA's
 * own origin, matching Sanctum's default stateful domain list.
 */
class CustomerPortalAuthTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost';

    public function test_full_join_otp_verify_portal_flow(): void
    {
        $token = app(LoyaltySettingsService::class)->ensureQrToken();

        $join = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/join', [
            'first_name' => 'Sara',
            'last_name' => 'Amrani',
            'phone' => '0612345678',
            'terms_consent' => true,
            'token' => $token,
        ]);
        $join->assertCreated();

        $this->assertDatabaseHas('clients', ['phone_e164' => '+212612345678']);

        $otpRequest = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/otp/request', [
            'phone' => '0612345678',
        ]);
        $otpRequest->assertOk();
        $devCode = $otpRequest->json('data.dev_code');
        $this->assertNotNull($devCode, 'dev provider must echo the code back in non-production');

        $verify = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/otp/verify', [
            'phone' => '0612345678',
            'code' => $devCode,
        ]);
        $verify->assertOk();

        $home = $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home');
        $home->assertOk();

        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertOk();
    }

    public function test_portal_route_rejects_unauthenticated_request(): void
    {
        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertUnauthorized();
    }

    public function test_wrong_otp_code_is_rejected_and_does_not_establish_a_session(): void
    {
        Client::factory()->create(['phone_e164' => '+212612345678', 'phone' => '0612345678']);

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/otp/request', [
            'phone' => '0612345678',
        ])->assertOk();

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/otp/verify', [
            'phone' => '0612345678',
            'code' => '000000',
        ])->assertUnprocessable();

        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertUnauthorized();
    }
}
