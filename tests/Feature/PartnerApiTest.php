<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Partner;
use App\Models\Service;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PartnerApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        return $admin;
    }

    private function createPartnerWithAccount(array $overrides = []): Partner
    {
        $user = User::factory()->create([
            'email' => $overrides['email'] ?? 'partner@test.com',
            'password' => Hash::make('secret-pass'),
            'role' => 'partner',
        ]);
        $user->assignRole('partner');

        return Partner::create(array_merge([
            'name' => 'Hotel Atlas',
            'is_active' => true,
            'user_id' => $user->id,
        ], $overrides['partner'] ?? []));
    }

    public function test_admin_can_create_partner_with_account_and_commission_grid(): void
    {
        $this->actingAsAdmin();

        $serviceA = Service::factory()->create(['price' => 100]);
        $serviceB = Service::factory()->create(['price' => 200]);

        $response = $this->postJson('/api/partners', [
            'name' => 'Riad Yasmine',
            'contact_name' => 'Karim',
            'phone' => '0600000000',
            'login_email' => 'riad@partenaire.com',
            'commissions' => [
                ['service_id' => $serviceA->id, 'type' => 'percentage', 'value' => 10],
                ['service_id' => $serviceB->id, 'type' => 'fixed', 'value' => 50],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.partner.name', 'Riad Yasmine')
            ->assertJsonPath('data.login_email', 'riad@partenaire.com')
            ->json('data');

        $this->assertNotNull($response['temporary_password']);
        $this->assertCount(2, $response['partner']['commissions']);

        $user = User::where('email', 'riad@partenaire.com')->firstOrFail();
        $this->assertTrue($user->hasRole('partner'));
        $this->assertDatabaseHas('partner_service_commissions', [
            'service_id' => $serviceA->id,
            'type' => 'percentage',
            'value' => 10,
        ]);
    }

    public function test_admin_role_without_partners_permission_cannot_manage_partners(): void
    {
        $employeeUser = User::factory()->create();
        $employeeUser->assignRole('employee');
        Sanctum::actingAs($employeeUser);

        $this->getJson('/api/partners')->assertForbidden();
        $this->postJson('/api/partners', ['name' => 'X', 'login_email' => 'x@x.com'])->assertForbidden();
    }

    public function test_partner_reservation_is_forced_pending_and_attributed_to_partner(): void
    {
        $partner = $this->createPartnerWithAccount();
        Sanctum::actingAs($partner->user);

        $client = Client::factory()->create(['name' => 'Client Groupe', 'partner_id' => $partner->id]);
        $service = Service::factory()->create(['duration_minutes' => 30, 'price' => 100]);

        $created = $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'starts_at' => '2026-08-10 15:00:00',
            'status' => 'confirmed', // must be ignored — partner bookings land pending
            'people' => [
                ['name' => 'Client Groupe'],
                ['name' => 'Amie 1'],
            ],
            'items' => [
                ['service_id' => $service->id, 'employee_id' => null, 'person_index' => 0],
                ['service_id' => $service->id, 'employee_id' => null, 'person_index' => 1],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.partner_id', $partner->id)
            ->assertJsonPath('data.people.1.name', 'Amie 1')
            ->assertJsonPath('data.reservation_items.1.person_index', 1)
            ->json('data');

        // Both persons run in parallel → 30 min, not 60.
        $this->assertSame(30, $created['duration_minutes']);
    }

    public function test_partner_cannot_book_using_another_partners_client(): void
    {
        $partner = $this->createPartnerWithAccount();
        $otherPartner = $this->createPartnerWithAccount([
            'email' => 'other@test.com',
            'partner' => ['name' => 'Autre Hotel'],
        ]);
        $foreignClient = Client::factory()->create(['partner_id' => $otherPartner->id]);
        $bogoslandClient = Client::factory()->create(['partner_id' => null]);
        $service = Service::factory()->create();

        Sanctum::actingAs($partner->user);

        $this->postJson('/api/appointments', [
            'client_id' => $foreignClient->id,
            'service_id' => $service->id,
            'starts_at' => '2026-08-10 15:00:00',
        ])->assertForbidden();

        $this->postJson('/api/appointments', [
            'client_id' => $bogoslandClient->id,
            'service_id' => $service->id,
            'starts_at' => '2026-08-10 15:00:00',
        ])->assertForbidden();

        $this->assertDatabaseCount('appointments', 0);
    }

    public function test_suspended_partner_can_still_view_but_not_create_reservations(): void
    {
        $partner = $this->createPartnerWithAccount(['partner' => ['status' => 'suspended', 'is_active' => false]]);
        $ownClient = Client::factory()->create(['partner_id' => $partner->id]);
        $service = Service::factory()->create();
        $appointment = Appointment::factory()->create([
            'partner_id' => $partner->id,
            'starts_at' => '2026-08-10 10:00:00',
            'ends_at' => '2026-08-10 10:30:00',
        ]);

        Sanctum::actingAs($partner->user);

        $this->getJson('/api/appointments?date=2026-08-10')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/appointments/'.$appointment->id)->assertOk();

        $this->postJson('/api/appointments', [
            'client_id' => $ownClient->id,
            'service_id' => $service->id,
            'starts_at' => '2026-08-10 16:00:00',
        ])->assertForbidden();
    }

    public function test_partner_only_sees_their_own_reservations(): void
    {
        $partner = $this->createPartnerWithAccount();
        $otherPartner = $this->createPartnerWithAccount([
            'email' => 'other@test.com',
            'partner' => ['name' => 'Autre Hotel'],
        ]);

        $own = Appointment::factory()->create([
            'partner_id' => $partner->id,
            'starts_at' => '2026-08-10 10:00:00',
            'ends_at' => '2026-08-10 10:30:00',
        ]);
        $foreign = Appointment::factory()->create([
            'partner_id' => $otherPartner->id,
            'starts_at' => '2026-08-10 11:00:00',
            'ends_at' => '2026-08-10 11:30:00',
        ]);
        $salonOwn = Appointment::factory()->create([
            'partner_id' => null,
            'starts_at' => '2026-08-10 12:00:00',
            'ends_at' => '2026-08-10 12:30:00',
        ]);

        Sanctum::actingAs($partner->user);

        $this->getJson('/api/appointments?date=2026-08-10')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $own->id);

        $this->getJson('/api/appointments/'.$foreign->id)->assertForbidden();
        $this->deleteJson('/api/appointments/'.$salonOwn->id)->assertForbidden();
    }

    public function test_partner_cannot_confirm_but_can_cancel_their_reservation(): void
    {
        $partner = $this->createPartnerWithAccount();
        $appointment = Appointment::factory()->create([
            'partner_id' => $partner->id,
            'status' => 'pending',
            'starts_at' => '2026-08-10 10:00:00',
            'ends_at' => '2026-08-10 10:30:00',
        ]);

        Sanctum::actingAs($partner->user);

        $this->patchJson('/api/appointments/'.$appointment->id, ['status' => 'confirmed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'pending');

        $this->patchJson('/api/appointments/'.$appointment->id, ['status' => 'cancelled'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_deactivated_partner_cannot_book(): void
    {
        $partner = $this->createPartnerWithAccount(['partner' => ['is_active' => false]]);
        Sanctum::actingAs($partner->user);

        $client = Client::factory()->create();
        $service = Service::factory()->create();

        $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'service_id' => $service->id,
            'starts_at' => '2026-08-10 15:00:00',
        ])->assertForbidden();
    }

    public function test_appointment_resource_estimates_partner_commission(): void
    {
        $this->actingAsAdmin();

        $partner = $this->createPartnerWithAccount();
        $serviceA = Service::factory()->create(['price' => 100, 'duration_minutes' => 30]);
        $serviceB = Service::factory()->create(['price' => 200, 'duration_minutes' => 30]);
        $partner->commissions()->create(['service_id' => $serviceA->id, 'type' => 'percentage', 'value' => 10]);
        $partner->commissions()->create(['service_id' => $serviceB->id, 'type' => 'fixed', 'value' => 25]);

        $client = Client::factory()->create();

        $created = $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'partner_id' => $partner->id,
            'starts_at' => '2026-08-10 15:00:00',
            'items' => [
                ['service_id' => $serviceA->id, 'employee_id' => null],
                ['service_id' => $serviceB->id, 'employee_id' => null],
            ],
        ])->assertCreated()->json('data');

        // 10% of 100 + fixed 25 = 35
        $this->assertSame(35.0, (float) $created['partner_commission']);
        $this->assertSame('Hotel Atlas', $created['partner']['name']);
    }

    public function test_partner_update_replaces_commission_grid(): void
    {
        $this->actingAsAdmin();

        $partner = $this->createPartnerWithAccount();
        $serviceA = Service::factory()->create();
        $serviceB = Service::factory()->create();
        $partner->commissions()->create(['service_id' => $serviceA->id, 'type' => 'percentage', 'value' => 10]);

        $this->putJson('/api/partners/'.$partner->id, [
            'commissions' => [
                ['service_id' => $serviceB->id, 'type' => 'fixed', 'value' => 40],
            ],
        ])->assertOk();

        $this->assertDatabaseMissing('partner_service_commissions', ['service_id' => $serviceA->id]);
        $this->assertDatabaseHas('partner_service_commissions', [
            'partner_id' => $partner->id,
            'service_id' => $serviceB->id,
            'type' => 'fixed',
            'value' => 40,
        ]);
    }

    public function test_admin_fiche_reports_real_performance_aggregates(): void
    {
        $this->actingAsAdmin();

        $partner = $this->createPartnerWithAccount();
        $service = Service::factory()->create(['price' => 100]);
        $partner->commissions()->create(['service_id' => $service->id, 'type' => 'percentage', 'value' => 10]);

        Client::factory()->create(['partner_id' => $partner->id]);
        Client::factory()->create(['partner_id' => $partner->id]);
        Appointment::factory()->create(['partner_id' => $partner->id, 'status' => 'confirmed']);
        Appointment::factory()->create(['partner_id' => $partner->id, 'status' => 'pending']);

        $employee = \App\Models\Employee::factory()->create();
        $creator = User::factory()->create(['role' => 'admin']);
        \App\Models\PartnerCommission::create([
            'partner_id' => $partner->id,
            'client_id' => Client::where('partner_id', $partner->id)->first()->id,
            'prestation_id' => \App\Models\Prestation::create([
                'reference' => 'PRE-FICHE-'.uniqid(),
                'employee_id' => $employee->id,
                'created_by_user_id' => $creator->id,
                'status' => 'paid',
            ])->id,
            'base_amount' => 100,
            'amount' => 10,
            'status' => 'validated',
        ]);

        $response = $this->getJson('/api/partners/'.$partner->id)->assertOk()->json('data');

        $this->assertSame(2, $response['performance']['clients_count']);
        $this->assertSame(2, $response['performance']['appointments_count']);
        $this->assertSame(1, $response['performance']['appointments_confirmed_count']);
        $this->assertEquals(10.0, $response['performance']['commission_due']);
    }

    public function test_admin_can_suspend_partner_without_revoking_login(): void
    {
        $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();

        $this->patchJson('/api/partners/'.$partner->id.'/status', ['status' => 'suspended'])
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended')
            ->assertJsonPath('data.is_active', false);

        $this->assertTrue($partner->user->fresh()->is_active);
    }

    public function test_deleting_partner_removes_login_account_but_keeps_reservations(): void
    {
        $this->actingAsAdmin();

        $partner = $this->createPartnerWithAccount();
        $userId = $partner->user_id;
        $appointment = Appointment::factory()->create(['partner_id' => $partner->id]);

        $this->deleteJson('/api/partners/'.$partner->id)->assertNoContent();

        $this->assertDatabaseMissing('partners', ['id' => $partner->id]);
        $this->assertDatabaseMissing('users', ['id' => $userId]);
        $this->assertDatabaseHas('appointments', ['id' => $appointment->id, 'partner_id' => null]);
    }
}
