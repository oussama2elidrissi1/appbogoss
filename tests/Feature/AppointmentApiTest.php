<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AppointmentApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsAdmin(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
    }

    public function test_appointment_crud_endpoints_work(): void
    {
        $this->actingAsAdmin();

        $client = Client::factory()->create(['name' => 'Client Reservation']);
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $service = Service::factory()->create([
            'name' => 'Coupe simple',
            'duration_minutes' => 30,
            'price' => 40,
        ]);

        $startsAt = Carbon::parse('2026-07-28 14:00:00');

        $created = $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'starts_at' => $startsAt->toDateTimeString(),
            'status' => 'confirmed',
            'notes' => 'Client prefere 14h.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.client.name', 'Client Reservation')
            ->assertJsonPath('data.employee.name', 'Ahmed')
            ->assertJsonPath('data.service.name', 'Coupe simple')
            ->assertJsonPath('data.status', 'confirmed')
            ->json('data');

        $this->assertDatabaseHas('appointments', [
            'id' => $created['id'],
            'ends_at' => $startsAt->copy()->addMinutes(30)->toDateTimeString(),
        ]);

        $this->getJson('/api/appointments?date=2026-07-28')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $created['id']);

        $this->patchJson('/api/appointments/'.$created['id'], [
            'status' => 'completed',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');

        $this->deleteJson('/api/appointments/'.$created['id'])
            ->assertNoContent();

        $this->assertDatabaseMissing('appointments', ['id' => $created['id']]);
    }

    public function test_appointment_index_can_filter_by_employee_and_status(): void
    {
        $this->actingAsAdmin();

        $employee = Employee::factory()->create();
        $otherEmployee = Employee::factory()->create();

        Appointment::factory()->create([
            'employee_id' => $employee->id,
            'status' => 'confirmed',
            'starts_at' => '2026-07-28 10:00:00',
            'ends_at' => '2026-07-28 10:30:00',
        ]);

        Appointment::factory()->create([
            'employee_id' => $otherEmployee->id,
            'status' => 'cancelled',
            'starts_at' => '2026-07-28 11:00:00',
            'ends_at' => '2026-07-28 11:30:00',
        ]);

        $this->getJson("/api/appointments?date=2026-07-28&employee_id={$employee->id}&status=confirmed")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.employee_id', $employee->id)
            ->assertJsonPath('data.0.status', 'confirmed');
    }

    public function test_status_transitions_are_logged_and_stamp_audit_columns(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $client = Client::factory()->create();
        $service = Service::factory()->create();

        $created = $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'service_id' => $service->id,
            'starts_at' => '2026-08-20 10:00:00',
            'status' => 'confirmed',
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('appointments', [
            'id' => $created['id'],
            'created_by_user_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('appointment_status_logs', [
            'appointment_id' => $created['id'],
            'from_status' => null,
            'to_status' => 'confirmed',
            'user_id' => $admin->id,
        ]);

        $confirmer = User::factory()->create();
        $confirmer->assignRole('admin');
        Sanctum::actingAs($confirmer);

        $this->patchJson('/api/appointments/'.$created['id'], ['status' => 'completed'])->assertOk();
        $this->assertDatabaseHas('appointment_status_logs', [
            'appointment_id' => $created['id'],
            'from_status' => 'confirmed',
            'to_status' => 'completed',
            'user_id' => $confirmer->id,
        ]);

        $canceller = User::factory()->create();
        $canceller->assignRole('admin');
        Sanctum::actingAs($canceller);

        $this->patchJson('/api/appointments/'.$created['id'], [
            'status' => 'cancelled',
            'cancellation_reason' => 'Client indisponible',
        ])->assertOk();

        $this->assertDatabaseHas('appointments', [
            'id' => $created['id'],
            'cancelled_by_user_id' => $canceller->id,
            'cancellation_reason' => 'Client indisponible',
        ]);
        $this->assertDatabaseHas('appointment_status_logs', [
            'appointment_id' => $created['id'],
            'from_status' => 'completed',
            'to_status' => 'cancelled',
            'user_id' => $canceller->id,
            'reason' => 'Client indisponible',
        ]);
    }

    public function test_refused_appointments_do_not_block_conflicting_slots(): void
    {
        $this->actingAsAdmin();

        $employee = Employee::factory()->create();
        $blocking = Appointment::factory()->create([
            'employee_id' => $employee->id,
            'status' => 'confirmed',
            'starts_at' => '2026-08-20 15:00:00',
            'ends_at' => '2026-08-20 15:30:00',
        ]);

        $client = Client::factory()->create();
        $service = Service::factory()->create(['duration_minutes' => 30]);

        // Still blocked while confirmed.
        $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'starts_at' => '2026-08-20 15:00:00',
        ])->assertStatus(422);

        $this->patchJson('/api/appointments/'.$blocking->id, ['status' => 'refused'])->assertOk();

        // No longer blocked once refused.
        $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'starts_at' => '2026-08-20 15:00:00',
        ])->assertCreated();
    }

    public function test_reservation_item_snapshot_is_preserved_then_refreshed_on_service_change(): void
    {
        $this->actingAsAdmin();

        $client = Client::factory()->create();
        $serviceA = Service::factory()->create(['price' => 100, 'duration_minutes' => 30]);
        $serviceB = Service::factory()->create(['price' => 200, 'duration_minutes' => 45]);

        $created = $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'starts_at' => '2026-08-20 09:00:00',
            'items' => [['service_id' => $serviceA->id, 'employee_id' => null]],
        ])->assertCreated()->json('data');

        $uid = $created['reservation_items'][0]['uid'];
        $this->assertNotEmpty($uid);
        $this->assertSame(100.0, (float) $created['reservation_items'][0]['price_snapshot']);

        // Price changes after the fact — an unrelated edit that echoes the
        // same uid/service must keep showing what the partner originally saw.
        $serviceA->update(['price' => 500]);

        $unrelatedEdit = $this->patchJson('/api/appointments/'.$created['id'], [
            'notes' => 'Client VIP',
            'items' => [['uid' => $uid, 'service_id' => $serviceA->id, 'employee_id' => null]],
        ])->assertOk()->json('data');

        $this->assertSame(100.0, (float) $unrelatedEdit['reservation_items'][0]['price_snapshot']);
        $this->assertSame($uid, $unrelatedEdit['reservation_items'][0]['uid']);

        // Swapping the actual service line gets a fresh uid and current price.
        $serviceChanged = $this->patchJson('/api/appointments/'.$created['id'], [
            'items' => [['service_id' => $serviceB->id, 'employee_id' => null]],
        ])->assertOk()->json('data');

        $this->assertNotSame($uid, $serviceChanged['reservation_items'][0]['uid']);
        $this->assertSame(200.0, (float) $serviceChanged['reservation_items'][0]['price_snapshot']);
    }

    public function test_client_can_be_created_for_a_reservation(): void
    {
        $this->actingAsAdmin();

        $created = $this->postJson('/api/clients', [
            'name' => 'Nouveau Client',
            'phone' => '0611223344',
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Nouveau Client')
            ->assertJsonPath('data.phone', '0611223344')
            ->json('data');

        $this->assertDatabaseHas('clients', [
            'id' => $created['id'],
            'name' => 'Nouveau Client',
        ]);
    }
}
