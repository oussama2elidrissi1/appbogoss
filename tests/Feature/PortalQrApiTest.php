<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientQrToken;
use App\Models\User;
use App\Services\LoyaltySettingsService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /api/client/qr — la carte client du portail mobile.
 *
 * Le point sensible n'est pas le contenu de la réponse mais son cloisonnement :
 * un client ne doit voir que SON token, et un compte staff ne doit pas passer
 * par cette route (elle vit derrière `auth:client,client-api` + `client.account`).
 */
class PortalQrApiTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function customer(string $phone = '0612345678'): Client
    {
        return Client::factory()->create([
            'phone' => $phone,
            'phone_e164' => '+212'.substr($phone, 1),
            'password' => 'motdepasse123',
        ]);
    }

    private function tokenFor(Client $client): string
    {
        return $this->postJson('/api/mobile/client/login', [
            'phone' => $client->phone,
            'password' => 'motdepasse123',
        ])->json('token');
    }

    public function test_client_reads_their_own_qr_token(): void
    {
        $client = $this->customer();
        ClientQrToken::create(['client_id' => $client->id, 'token' => 'token-du-client']);

        $this->withToken($this->tokenFor($client))
            ->getJson('/api/client/qr')
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.token', 'token-du-client')
            ->assertJsonPath('data.name', $client->name);
    }

    public function test_a_client_never_receives_another_clients_token(): void
    {
        $mine = $this->customer('0611111111');
        $other = $this->customer('0622222222');
        ClientQrToken::create(['client_id' => $mine->id, 'token' => 'le-mien']);
        ClientQrToken::create(['client_id' => $other->id, 'token' => 'celui-de-lautre']);

        $response = $this->withToken($this->tokenFor($mine))->getJson('/api/client/qr');

        $response->assertOk()->assertJsonPath('data.token', 'le-mien');
        $response->assertDontSee('celui-de-lautre');
    }

    public function test_a_revoked_token_is_not_returned(): void
    {
        $client = $this->customer();
        ClientQrToken::create([
            'client_id' => $client->id,
            'token' => 'revoque',
            'revoked_at' => now(),
        ]);

        $this->withToken($this->tokenFor($client))
            ->getJson('/api/client/qr')
            ->assertOk()
            ->assertJsonPath('data.token', null);
    }

    public function test_no_token_yet_returns_null_and_creates_nothing(): void
    {
        $client = $this->customer();

        $this->withToken($this->tokenFor($client))
            ->getJson('/api/client/qr')
            ->assertOk()
            ->assertJsonPath('data.token', null);

        // Lecture stricte : générer un token reste une action du personnel.
        $this->assertDatabaseCount('client_qr_tokens', 0);
    }

    public function test_the_setting_switches_the_feature_off(): void
    {
        $client = $this->customer();
        ClientQrToken::create(['client_id' => $client->id, 'token' => 'token-du-client']);
        app(LoyaltySettingsService::class)->set(['loyalty_personal_qr_enabled' => false]);

        $this->withToken($this->tokenFor($client))
            ->getJson('/api/client/qr')
            ->assertOk()
            ->assertJsonPath('data.enabled', false)
            // Désactivé côté réglages = aucun token diffusé, pas seulement un
            // drapeau que le mobile pourrait ignorer.
            ->assertJsonPath('data.token', null);
    }

    public function test_unauthenticated_request_is_refused(): void
    {
        $this->getJson('/api/client/qr')->assertUnauthorized();
    }

    public function test_a_staff_token_cannot_reach_the_client_card(): void
    {
        $user = User::factory()->create(['role' => 'super-admin', 'password' => 'password123']);
        $user->assignRole('super-admin');

        $staffToken = $this->postJson('/api/mobile/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->json('token');

        $this->withToken($staffToken)->getJson('/api/client/qr')->assertUnauthorized();
    }

    public function test_a_staff_browser_session_is_refused_by_client_account(): void
    {
        $user = User::factory()->create(['role' => 'super-admin', 'password' => 'password123']);
        $user->assignRole('super-admin');

        $this->withHeader('Referer', self::ORIGIN)->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertOk();

        // Même mécanique que le reste de /api/client/* : Sanctum résout la
        // session `web` avant le token, c'est `client.account` qui tranche.
        $this->withHeader('Referer', self::ORIGIN)
            ->getJson('/api/client/qr')
            ->assertForbidden();
    }
}
