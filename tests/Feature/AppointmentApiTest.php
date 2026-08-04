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
