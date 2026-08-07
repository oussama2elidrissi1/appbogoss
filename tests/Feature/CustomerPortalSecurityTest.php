<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientQrToken;
use App\Models\CustomerLoyaltyAccount;
use App\Models\Employee;
use App\Models\User;
use App\Services\LoyaltySettingsService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * §31 — every boundary a real attacker or a confused browser tab could
 * cross: another client's portal data, a revoked/invalid QR token, and
 * staff acting without the right permission.
 */
class CustomerPortalSecurityTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function loginAsClient(Client $client): void
    {
        $client->update(['phone_verified_at' => now()]);
        $this->actingAs($client, 'client');
    }

    public function test_a_clients_portal_home_never_reflects_another_clients_data(): void
    {
        $clientA = Client::factory()->create(['phone_e164' => '+212611111111']);
        CustomerLoyaltyAccount::create(['client_id' => $clientA->id, 'points_balance' => 42, 'status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);

        $clientB = Client::factory()->create(['phone_e164' => '+212622222222']);
        CustomerLoyaltyAccount::create(['client_id' => $clientB->id, 'points_balance' => 999, 'status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);

        $this->loginAsClient($clientA);

        $response = $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/home');
        $response->assertOk();
        $response->assertJsonPath('data.name', $clientA->name);
        $response->assertJsonPath('data.points_balance', 42);
        $this->assertNotSame(999, $response->json('data.points_balance'));
    }

    public function test_a_clients_rewards_list_only_ever_contains_their_own_rewards(): void
    {
        $clientA = Client::factory()->create();
        $clientB = Client::factory()->create();

        $program = \App\Models\LoyaltyProgram::create([
            'name' => '5 Hammams', 'type' => \App\Models\LoyaltyProgram::TYPE_SERVICE_COUNT, 'is_active' => true,
            'config' => ['threshold' => 5], 'commission_basis' => 'none',
        ]);

        \App\Models\LoyaltyReward::create([
            'client_id' => $clientB->id, 'loyalty_program_id' => $program->id, 'type' => 'service',
            'status' => \App\Models\LoyaltyReward::STATUS_AVAILABLE, 'generated_at' => now(), 'expires_at' => now()->addDays(30),
        ]);

        $this->loginAsClient($clientA);
        $response = $this->withHeader('Referer', self::ORIGIN)->getJson('/api/client/rewards');
        $response->assertOk();
        $response->assertJsonCount(0, 'data.available');
    }

    public function test_revoked_personal_qr_token_is_rejected_on_lookup(): void
    {
        $client = Client::factory()->create();
        $token = ClientQrToken::create(['client_id' => $client->id, 'token' => 'a-valid-looking-token', 'revoked_at' => now()]);

        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/qr/lookup', ['token' => $token->token]);
        $response->assertUnprocessable();
    }

    public function test_unknown_personal_qr_token_is_rejected_on_lookup(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/qr/lookup', ['token' => 'this-token-does-not-exist']);
        $response->assertUnprocessable();
    }

    public function test_a_valid_active_personal_qr_token_resolves_to_its_client(): void
    {
        $client = Client::factory()->create();
        $token = ClientQrToken::create(['client_id' => $client->id, 'token' => 'a-valid-active-token']);

        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/qr/lookup', ['token' => $token->token]);
        $response->assertOk();
        $response->assertJsonPath('data.client_id', $client->id);
    }

    public function test_employee_without_loyalty_redeem_permission_cannot_use_qr_lookup(): void
    {
        $client = Client::factory()->create();
        $token = ClientQrToken::create(['client_id' => $client->id, 'token' => 'a-valid-token-2']);

        // Employees hold loyalty.redeem by default (RolesAndPermissionsSeeder) —
        // simulate a role that genuinely lacks it to prove the gate is real.
        $user = User::factory()->create(['role' => 'employee']);
        $employee = Employee::factory()->create(['user_id' => $user->id]);
        $user->syncPermissions([]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/qr/lookup', ['token' => $token->token]);
        $response->assertForbidden();
    }

    public function test_join_is_rejected_when_the_qr_token_does_not_match(): void
    {
        app(LoyaltySettingsService::class)->ensureQrToken();

        $response = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/join', [
            'first_name' => 'Test', 'last_name' => 'Intrus', 'phone' => '0688888888',
            'terms_consent' => true, 'token' => 'wrong-token',
        ]);
        $response->assertUnprocessable();
        $this->assertDatabaseMissing('clients', ['phone_e164' => '+212688888888']);
    }

    public function test_join_is_rejected_when_registration_is_disabled(): void
    {
        $settings = app(LoyaltySettingsService::class);
        $token = $settings->ensureQrToken();
        $settings->set(['loyalty_qr_registration_enabled' => false]);

        $response = $this->withHeader('Referer', self::ORIGIN)->postJson('/api/public/join', [
            'first_name' => 'Test', 'last_name' => 'Intrus', 'phone' => '0688888888',
            'terms_consent' => true, 'token' => $token,
        ]);
        $response->assertUnprocessable();
    }
}
