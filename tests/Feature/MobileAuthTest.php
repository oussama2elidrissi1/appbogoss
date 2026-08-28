<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Employee;
use App\Models\User;
use App\Services\LoyaltySettingsService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Phase 0 — bearer-token authentication for the Flutter app.
 *
 * Every case here goes through a real HTTP request with a real
 * `Authorization: Bearer` header rather than Sanctum::actingAs(), which calls
 * RequestGuard::setUser() and short-circuits Laravel\Sanctum\Guard::__invoke()
 * entirely — precisely the code whose provider check and `sanctum.guard`
 * session fallback this phase depends on. actingAs() would make the
 * cross-audience tests below pass no matter how the guards were configured.
 */
class MobileAuthTest extends TestCase
{
    use RefreshDatabase;

    /** Matches Sanctum's default stateful domain list, i.e. a real browser. */
    private const ORIGIN = 'http://localhost';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function staff(string $role = 'admin', array $attributes = []): User
    {
        $user = User::factory()->create(array_merge([
            'role' => $role,
            'password' => 'password123',
        ], $attributes));
        $user->assignRole($role);

        return $user;
    }

    private function customer(array $attributes = []): Client
    {
        return Client::factory()->create(array_merge([
            'phone' => '0612345678',
            'phone_e164' => '+212612345678',
            'password' => 'motdepasse123',
        ], $attributes));
    }

    private function staffToken(User $user): string
    {
        return $this->postJson('/api/mobile/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->json('token');
    }

    private function customerToken(Client $client): string
    {
        return $this->postJson('/api/mobile/client/login', [
            'phone' => $client->phone,
            'password' => 'motdepasse123',
        ])->json('token');
    }

    /**
     * Simulates the process boundary between two real HTTP requests.
     *
     * A test method runs every request against ONE container, and both
     * RequestGuard::user() and SessionGuard::user() memoise whatever account
     * they resolved (RequestGuard.php:53). So a follow-up call inside the same
     * test would replay the previous resolution and never re-check a token
     * that has since been deleted — the assertion would pass or fail for
     * reasons that have nothing to do with the code under test. Production has
     * no such carry-over: cPanel runs classic PHP-FPM, one container per
     * request. Only needed where a test revokes or invalidates mid-method.
     */
    private function newRequestCycle(): void
    {
        $this->app['auth']->forgetGuards();
    }

    /* ----------------------------------------------------------------- *
     * Staff login
     * ----------------------------------------------------------------- */

    public function test_staff_login_returns_a_token_and_the_account_payload(): void
    {
        $user = $this->staff();
        Employee::factory()->create(['user_id' => $user->id, 'name' => 'Nadia']);

        $response = $this->postJson('/api/mobile/login', [
            'email' => $user->email,
            'password' => 'password123',
            'device_name' => 'Pixel 8',
        ]);

        $response->assertOk()
            ->assertJsonPath('type', 'staff')
            ->assertJsonPath('account.id', $user->id)
            ->assertJsonPath('account.name', $user->name)
            ->assertJsonPath('account.employee_name', 'Nadia')
            ->assertJsonStructure(['token', 'type', 'account' => ['id', 'name', 'role', 'roles', 'permissions']]);

        $this->assertNotEmpty($response->json('token'));
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_type' => User::class,
            'tokenable_id' => $user->id,
            'name' => 'Pixel 8',
        ]);
    }

    public function test_staff_login_rejects_wrong_password_without_issuing_a_token(): void
    {
        $user = $this->staff();

        $this->postJson('/api/mobile/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ])->assertStatus(401);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_staff_login_rejects_an_unknown_email(): void
    {
        $this->postJson('/api/mobile/login', [
            'email' => 'inconnu@example.com',
            'password' => 'password123',
        ])->assertStatus(401);
    }

    public function test_staff_login_rejects_a_deactivated_account_without_issuing_a_token(): void
    {
        $user = $this->staff('employee', ['is_active' => false]);

        $this->postJson('/api/mobile/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertStatus(403);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_repeated_failures_lock_the_account_out(): void
    {
        $user = $this->staff();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/mobile/login', [
                'email' => $user->email,
                'password' => 'wrong-password',
            ])->assertStatus(401);
        }

        // The 6th call is refused before the credentials are even checked —
        // and stays refused for the correct password too.
        $this->postJson('/api/mobile/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertStatus(429);
    }

    /* ----------------------------------------------------------------- *
     * Staff token against the existing API
     * ----------------------------------------------------------------- */

    public function test_staff_token_authenticates_the_existing_endpoints(): void
    {
        $user = $this->staff();
        $token = $this->staffToken($user);

        $this->withToken($token)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('id', $user->id);

        $this->withToken($token)->getJson('/api/mobile/me')
            ->assertOk()
            ->assertJsonPath('type', 'staff')
            ->assertJsonPath('account.id', $user->id);
    }

    public function test_requests_without_a_token_are_refused(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
        $this->getJson('/api/mobile/me')->assertUnauthorized();
        $this->getJson('/api/prestations')->assertUnauthorized();
        $this->postJson('/api/mobile/logout')->assertUnauthorized();
    }

    public function test_an_invalid_token_is_refused(): void
    {
        $this->withToken('1|totalement-inventé')->getJson('/api/me')->assertUnauthorized();
    }

    public function test_a_staff_token_is_still_subject_to_the_existing_permissions(): void
    {
        $user = $this->staff('employee');
        Employee::factory()->create(['user_id' => $user->id]);
        $token = $this->staffToken($user);

        // Same expectations as RoleAccessTest, but reached over a bearer token
        // instead of a session — the `permission:` middleware must not care.
        $this->withToken($token)->getJson('/api/dashboard')->assertForbidden();
        $this->withToken($token)->getJson('/api/employees')->assertForbidden();
        $this->withToken($token)->getJson('/api/work-days/active')->assertForbidden();
        $this->withToken($token)->postJson('/api/clients', ['name' => 'Intrus'])->assertForbidden();

        // …and what the role legitimately reaches still works.
        $this->withToken($token)->getJson('/api/services')->assertOk();
        $this->withToken($token)->getJson('/api/clients')->assertOk();
    }

    public function test_super_admin_token_still_bypasses_gates(): void
    {
        $user = $this->staff('super-admin');
        $token = $this->staffToken($user);

        $this->withToken($token)->getJson('/api/activity-logs')->assertOk();
    }

    public function test_a_token_stops_working_once_the_account_is_deactivated(): void
    {
        $user = $this->staff();
        $token = $this->staffToken($user);

        $this->withToken($token)->getJson('/api/me')->assertOk();

        $user->forceFill(['is_active' => false])->save();
        $this->newRequestCycle();

        // Tokens never expire (sanctum.expiration is null), so without the
        // Sanctum::authenticateAccessTokensUsing() hook in AuthServiceProvider
        // a disabled account would keep full API access forever.
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
    }

    /* ----------------------------------------------------------------- *
     * Logout / revocation
     * ----------------------------------------------------------------- */

    public function test_logout_revokes_only_the_calling_token(): void
    {
        $user = $this->staff();
        $phone = $this->staffToken($user);
        $tablet = $user->createToken('tablette')->plainTextToken;

        $this->withToken($phone)->postJson('/api/mobile/logout')->assertNoContent();
        $this->newRequestCycle();

        $this->withToken($phone)->getJson('/api/me')->assertUnauthorized();
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->withToken($tablet)->getJson('/api/me')->assertOk();
    }

    public function test_a_customer_can_revoke_their_own_token(): void
    {
        $client = $this->customer();
        $token = $this->customerToken($client);

        $this->withToken($token)->postJson('/api/mobile/logout')->assertNoContent();
        $this->newRequestCycle();

        $this->withToken($token)->getJson('/api/client/me')->assertUnauthorized();
    }

    /* ----------------------------------------------------------------- *
     * Customer login
     * ----------------------------------------------------------------- */

    public function test_customer_login_returns_a_token_and_the_portal_payload(): void
    {
        $client = $this->customer();

        $response = $this->postJson('/api/mobile/client/login', [
            'phone' => '0612345678',
            'password' => 'motdepasse123',
        ]);

        $response->assertOk()
            ->assertJsonPath('type', 'client')
            ->assertJsonPath('account.id', $client->id)
            ->assertJsonStructure(['token', 'type', 'account' => ['id', 'name', 'phone']]);

        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_type' => Client::class,
            'tokenable_id' => $client->id,
        ]);
    }

    public function test_customer_login_rejects_a_wrong_password(): void
    {
        $this->customer();

        $this->postJson('/api/mobile/client/login', [
            'phone' => '0612345678',
            'password' => 'wrong-password',
        ])->assertUnprocessable();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_customer_token_reaches_the_portal_endpoints(): void
    {
        $client = $this->customer();
        $token = $this->customerToken($client);

        $this->withToken($token)->getJson('/api/client/me')
            ->assertOk()
            ->assertJsonPath('data.id', $client->id);

        $this->withToken($token)->getJson('/api/mobile/me')
            ->assertOk()
            ->assertJsonPath('type', 'client')
            ->assertJsonPath('account.id', $client->id);
    }

    /* ----------------------------------------------------------------- *
     * Cross-audience isolation — the reason config/auth.php pins providers
     * ----------------------------------------------------------------- */

    public function test_a_customer_token_cannot_reach_staff_endpoints(): void
    {
        $client = $this->customer();
        $token = $this->customerToken($client);

        // /api/me and the routes below carry NO `permission:` middleware —
        // `auth:sanctum` is the only thing standing between a customer token
        // and them. Before config/auth.php pinned the sanctum guard to the
        // `users` provider, Guard::hasValidProvider() returned true for any
        // tokenable and every one of these answered 200.
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
        $this->withToken($token)->getJson('/api/prestations')->assertUnauthorized();
        $this->withToken($token)->getJson('/api/notifications')->assertUnauthorized();
        $this->withToken($token)->getJson('/api/services')->assertUnauthorized();
        $this->withToken($token)->getJson('/api/partner/dashboard')->assertUnauthorized();
        $this->withToken($token)->getJson('/api/dashboard')->assertUnauthorized();
    }

    public function test_a_customer_token_is_never_resolved_as_a_user_instance(): void
    {
        $client = $this->customer();
        $token = $this->customerToken($client);

        // The failure this guards against is type confusion, not just a status
        // code: a Client resolved as the staff account would be handed to
        // controllers that call $user->hasRole()/->employee and read
        // Client::$id as a users.id. /api/mobile/me is the one endpoint that
        // accepts both audiences, so it is where the two could be conflated.
        $response = $this->withToken($token)->getJson('/api/mobile/me')->assertOk();

        $this->assertSame('client', $response->json('type'));
        $this->assertArrayNotHasKey('permissions', $response->json('account'));
        $this->assertArrayNotHasKey('roles', $response->json('account'));
    }

    public function test_a_staff_token_cannot_reach_the_customer_portal(): void
    {
        $user = $this->staff('super-admin');
        $token = $this->staffToken($user);

        // Even a super-admin: Gate::before does not apply, the `client-api`
        // guard is pinned to the `clients` provider.
        $this->withToken($token)->getJson('/api/client/me')->assertUnauthorized();
        $this->withToken($token)->getJson('/api/client/subscriptions')->assertUnauthorized();
    }

    public function test_a_staff_browser_session_cannot_be_mistaken_for_a_customer(): void
    {
        $user = $this->staff('super-admin');

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertOk();

        // Laravel\Sanctum\Guard::__invoke() opens by looping over the GLOBAL
        // config('sanctum.guard') (['web']) for every sanctum guard instance,
        // `client-api` included, before it ever looks at a bearer token — so
        // this staff session DOES satisfy `auth:client-api`. What stops it is
        // the `client.account` middleware: 403, not a portal payload.
        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/me')->assertForbidden();
        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/subscriptions')->assertForbidden();
    }

    /* ----------------------------------------------------------------- *
     * The existing web authentication must be untouched
     * ----------------------------------------------------------------- */

    public function test_web_staff_session_login_still_works(): void
    {
        $user = $this->staff();

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertOk()->assertJsonPath('id', $user->id);

        // No token minted by the web login — cookie session only, as before.
        $this->assertDatabaseCount('personal_access_tokens', 0);

        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/me')->assertOk();
        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/logout')->assertNoContent();
        $this->newRequestCycle();

        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_web_customer_portal_session_still_works(): void
    {
        $qr = app(LoyaltySettingsService::class)->ensureQrToken();

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/join', [
            'first_name' => 'Sara',
            'last_name' => 'Amrani',
            'phone' => '0698765432',
            'password' => 'motdepasse123',
            'password_confirmation' => 'motdepasse123',
            'terms_consent' => true,
            'token' => $qr,
        ])->assertCreated();

        // The `client` cookie guard still resolves these routes first, so the
        // added `client-api` guard and `client.account` middleware are
        // transparent to the web portal.
        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/me')->assertOk();
        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home')->assertOk();

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/client/logout')->assertNoContent();
        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/me')->assertUnauthorized();

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/login', [
            'phone' => '0698765432',
            'password' => 'motdepasse123',
        ])->assertOk();
        $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/me')->assertOk();
    }
}
