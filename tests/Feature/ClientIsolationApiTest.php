<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Employee;
use App\Models\Partner;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Locks in the client-isolation rule (§3/§22 of the partner portal spec):
 * BOGOSLAND's shared client pool, and each partner's own portfolio, must be
 * enforced by the backend — a partner account must never be able to list,
 * read, or edit a client it doesn't own, no matter what the frontend hides.
 */
class ClientIsolationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function makePartner(string $email, string $name = 'Partenaire'): Partner
    {
        $user = User::factory()->create(['email' => $email, 'role' => 'partner']);
        $user->assignRole('partner');

        return Partner::create(['name' => $name, 'is_active' => true, 'user_id' => $user->id]);
    }

    private function staffUser(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    public function test_client_created_by_partner_is_owned_by_that_partner(): void
    {
        $partner = $this->makePartner('a@partner.test');
        Sanctum::actingAs($partner->user);

        $response = $this->postJson('/api/clients', ['name' => 'Client de A', 'phone' => '0611110000'])
            ->assertCreated();

        $this->assertSame($partner->id, $response->json('data.partner_id'));
        $this->assertDatabaseHas('clients', [
            'name' => 'Client de A',
            'partner_id' => $partner->id,
            'created_by_user_id' => $partner->user_id,
        ]);
    }

    public function test_partner_cannot_spoof_ownership_of_a_created_client(): void
    {
        $partnerA = $this->makePartner('a@partner.test');
        $partnerB = $this->makePartner('b@partner.test');
        Sanctum::actingAs($partnerA->user);

        // Even if partner_id is smuggled into the payload, it must be ignored.
        $response = $this->postJson('/api/clients', [
            'name' => 'Tentative',
            'partner_id' => $partnerB->id,
        ])->assertCreated();

        $this->assertSame($partnerA->id, $response->json('data.partner_id'));
    }

    public function test_partner_only_lists_their_own_clients(): void
    {
        $partnerA = $this->makePartner('a@partner.test', 'Partenaire A');
        $partnerB = $this->makePartner('b@partner.test', 'Partenaire B');

        $ownClient = Client::factory()->create(['partner_id' => $partnerA->id, 'name' => 'Client A']);
        Client::factory()->create(['partner_id' => $partnerB->id, 'name' => 'Client B']);
        Client::factory()->create(['partner_id' => null, 'name' => 'Client BOGOSLAND']);

        Sanctum::actingAs($partnerA->user);
        $response = $this->getJson('/api/clients')->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame($ownClient->id, $response->json('data.0.id'));
    }

    public function test_partner_search_never_surfaces_bogosland_or_other_partner_clients(): void
    {
        // §22 Test 3 & 4: searching by exact phone number never leaks a
        // BOGOSLAND-owned or another partner's client.
        $partnerA = $this->makePartner('a@partner.test');
        $partnerB = $this->makePartner('b@partner.test');

        Client::factory()->create(['partner_id' => null, 'phone' => '0699999999']);
        Client::factory()->create(['partner_id' => $partnerB->id, 'phone' => '0688888888']);

        Sanctum::actingAs($partnerA->user);

        $this->getJson('/api/clients?search=0699999999')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/clients?search=0688888888')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_partner_a_cannot_view_partner_bs_client(): void
    {
        // §22 Test 1: /clients/{id} belonging to another partner → 403.
        $partnerA = $this->makePartner('a@partner.test');
        $partnerB = $this->makePartner('b@partner.test');
        $client = Client::factory()->create(['partner_id' => $partnerB->id]);

        Sanctum::actingAs($partnerA->user);

        $this->getJson('/api/clients/'.$client->id)->assertForbidden();
    }

    public function test_partner_a_cannot_view_bogosland_owned_client(): void
    {
        $partnerA = $this->makePartner('a@partner.test');
        $client = Client::factory()->create(['partner_id' => null]);

        Sanctum::actingAs($partnerA->user);

        $this->getJson('/api/clients/'.$client->id)->assertForbidden();
    }

    public function test_partner_cannot_edit_another_partners_client_via_manipulated_id(): void
    {
        // §22 Test 2: manually changing the ID in a mutating request must be refused.
        $partnerA = $this->makePartner('a@partner.test');
        $partnerB = $this->makePartner('b@partner.test');
        $client = Client::factory()->create(['partner_id' => $partnerB->id, 'name' => 'Original']);

        Sanctum::actingAs($partnerA->user);

        $this->patchJson('/api/clients/'.$client->id, ['name' => 'Hacked'])->assertForbidden();
        $this->assertDatabaseHas('clients', ['id' => $client->id, 'name' => 'Original']);
    }

    public function test_partner_can_edit_their_own_client(): void
    {
        $partnerA = $this->makePartner('a@partner.test');
        $client = Client::factory()->create(['partner_id' => $partnerA->id, 'name' => 'Avant']);

        Sanctum::actingAs($partnerA->user);

        $this->patchJson('/api/clients/'.$client->id, ['name' => 'Après'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Après');
    }

    public function test_partner_cannot_delete_a_client(): void
    {
        $partnerA = $this->makePartner('a@partner.test');
        $client = Client::factory()->create(['partner_id' => $partnerA->id]);

        Sanctum::actingAs($partnerA->user);

        $this->deleteJson('/api/clients/'.$client->id)->assertForbidden();
        $this->assertDatabaseHas('clients', ['id' => $client->id]);
    }

    public function test_admin_sees_every_client_regardless_of_owner(): void
    {
        // §22 Test 5: BOGOSLAND admin keeps a global view.
        $partnerA = $this->makePartner('a@partner.test');
        $partnerB = $this->makePartner('b@partner.test');
        Client::factory()->create(['partner_id' => $partnerA->id]);
        Client::factory()->create(['partner_id' => $partnerB->id]);
        Client::factory()->create(['partner_id' => null]);

        Sanctum::actingAs($this->staffUser());

        $this->getJson('/api/clients')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_employee_without_caisse_permission_still_sees_the_shared_pool_for_checkout(): void
    {
        // Regression guard: plain staff (coiffeur) still needs to search the
        // whole client list to attach one to their own Prestation — only
        // partner-only accounts get scoped down.
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        Employee::factory()->create(['user_id' => $user->id]);

        Client::factory()->count(3)->create(['partner_id' => null]);

        Sanctum::actingAs($user);

        $this->getJson('/api/clients')->assertOk()->assertJsonCount(3, 'data');
    }
}
