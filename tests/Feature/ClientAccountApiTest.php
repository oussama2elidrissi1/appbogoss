<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Sale;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClientAccountApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
    }

    public function test_overview_returns_identity_portal_and_stats(): void
    {
        $workDay = WorkDay::factory()->create(['status' => 'open']);
        $client = Client::factory()->create([
            'name' => 'Ahmed El Idrissi',
            'phone' => '0612345678',
            'birth_date' => '1990-05-10',
            'gender' => 'male',
        ]);
        Sale::create([
            'work_day_id' => $workDay->id,
            'client_id' => $client->id,
            'total' => 250,
            'payment_method' => 'especes',
            'print_count' => 0,
        ]);

        $this->getJson('/api/clients/'.$client->id.'/overview')
            ->assertOk()
            ->assertJsonPath('data.client.name', 'Ahmed El Idrissi')
            ->assertJsonPath('data.client.birth_date', '1990-05-10')
            ->assertJsonPath('data.portal.has_password', false)
            ->assertJsonPath('data.stats.sales_count', 1)
            ->assertJsonPath('data.stats.total_spent', 250)
            ->assertJsonCount(1, 'data.recent_sales');
    }

    public function test_portal_password_creates_working_portal_access(): void
    {
        $client = Client::factory()->create(['phone' => '0612345678', 'phone_e164' => null, 'password' => null]);

        $response = $this->postJson('/api/clients/'.$client->id.'/portal-password')
            ->assertOk();

        $password = $response->json('data.temporary_password');
        $this->assertNotEmpty($password);

        $client->refresh();
        $this->assertNotNull($client->phone_e164);
        $this->assertNotNull($client->registered_at);
        // The generated password actually authenticates on the client guard.
        $this->assertTrue(Auth::guard('client')->validate([
            'phone_e164' => $client->phone_e164,
            'password' => $password,
        ]));
    }

    public function test_portal_password_requires_a_phone_number(): void
    {
        $client = Client::factory()->create(['phone' => null, 'phone_e164' => null]);

        $this->postJson('/api/clients/'.$client->id.'/portal-password')
            ->assertStatus(422);
    }

    public function test_portal_password_rejects_phone_already_used_by_another_client(): void
    {
        Client::factory()->create(['phone' => '0612345678', 'phone_e164' => '+212612345678']);
        $client = Client::factory()->create(['phone' => '0612345678', 'phone_e164' => null]);

        $this->postJson('/api/clients/'.$client->id.'/portal-password')
            ->assertStatus(422);
    }

    public function test_update_accepts_birth_date_and_gender(): void
    {
        $client = Client::factory()->create();

        $this->putJson('/api/clients/'.$client->id, [
            'birth_date' => '1995-03-15',
            'gender' => 'female',
        ])->assertOk();

        $this->assertDatabaseHas('clients', [
            'id' => $client->id,
            'gender' => 'female',
        ]);
        $this->assertSame('1995-03-15', $client->fresh()->birth_date->toDateString());
    }

    public function test_employee_role_cannot_access_client_account_management(): void
    {
        $client = Client::factory()->create();
        $employee = User::factory()->create(['role' => 'employee']);
        $employee->assignRole('employee');
        Sanctum::actingAs($employee);

        $this->getJson('/api/clients/'.$client->id.'/overview')->assertForbidden();
        $this->postJson('/api/clients/'.$client->id.'/portal-password')->assertForbidden();
    }
}
