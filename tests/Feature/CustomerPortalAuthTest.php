<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Services\LoyaltySettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Exercises the customer portal's real HTTP auth path end to end — join
 * (which doubles as login), returning-customer login, session cookie,
 * portal access — through actual requests rather than Sanctum::actingAs(),
 * which bypasses the EnsureFrontendRequestsAreStateful / session-cookie
 * mechanics entirely and would silently hide a broken guard config or a
 * mis-set stateful-domain list. A `Referer` header simulates a real browser
 * request from the SPA's own origin, matching Sanctum's default stateful
 * domain list.
 */
class CustomerPortalAuthTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost';

    public function test_full_join_then_portal_access_flow(): void
    {
        $token = app(LoyaltySettingsService::class)->ensureQrToken();

        $join = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/join', [
            'first_name' => 'Sara',
            'last_name' => 'Amrani',
            'phone' => '0612345678',
            'password' => 'motdepasse123',
            'password_confirmation' => 'motdepasse123',
            'terms_consent' => true,
            'token' => $token,
        ]);
        // Registration doubles as login — no separate verification step.
        $join->assertCreated();

        $this->assertDatabaseHas('clients', ['phone_e164' => '+212612345678']);

        $home = $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home');
        $home->assertOk();

        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertOk();
    }

    public function test_portal_route_rejects_unauthenticated_request(): void
    {
        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertUnauthorized();
    }

    public function test_returning_customer_can_log_in_with_phone_and_password(): void
    {
        $token = app(LoyaltySettingsService::class)->ensureQrToken();

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/join', [
            'first_name' => 'Sara',
            'last_name' => 'Amrani',
            'phone' => '0612345678',
            'password' => 'motdepasse123',
            'password_confirmation' => 'motdepasse123',
            'terms_consent' => true,
            'token' => $token,
        ])->assertCreated();

        // Fresh request cycle: logout, then log back in with the phone +
        // password chosen at registration.
        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/client/logout')->assertNoContent();
        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertUnauthorized();

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/login', [
            'phone' => '0612345678',
            'password' => 'motdepasse123',
        ])->assertOk();

        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertOk();
    }

    public function test_wrong_password_is_rejected_and_does_not_establish_a_session(): void
    {
        Client::factory()->create([
            'phone_e164' => '+212612345678',
            'phone' => '0612345678',
            'password' => 'motdepasse123',
        ]);

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/login', [
            'phone' => '0612345678',
            'password' => 'wrong-password',
        ])->assertUnprocessable();

        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertUnauthorized();
    }
}
