<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Service;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeServiceCommissionApiTest extends TestCase
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

    public function test_store_creates_a_single_rule_with_service_id(): void
    {
        $employee = Employee::factory()->create();
        $service = Service::factory()->create();

        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 40,
            'starts_on' => now()->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($service->id, $response->json('data.0.service_id'));
        $this->assertDatabaseCount('employee_service_commissions', 1);
    }

    public function test_store_creates_one_identical_rule_per_selected_service(): void
    {
        $employee = Employee::factory()->create();
        $serviceA = Service::factory()->create();
        $serviceB = Service::factory()->create();
        $serviceC = Service::factory()->create();

        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'service_ids' => [$serviceA->id, $serviceB->id, $serviceC->id],
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertCount(3, $response->json('data'));
        $this->assertDatabaseCount('employee_service_commissions', 3);
        foreach ([$serviceA, $serviceB, $serviceC] as $service) {
            $this->assertDatabaseHas('employee_service_commissions', [
                'employee_id' => $employee->id,
                'service_id' => $service->id,
                'type' => 'percentage',
                'value' => 50,
            ]);
        }
    }

    public function test_store_requires_either_service_id_or_service_ids(): void
    {
        $employee = Employee::factory()->create();

        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'type' => 'percentage',
            'value' => 40,
            'starts_on' => now()->toDateString(),
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('employee_service_commissions', 0);
    }

    public function test_store_rejects_duplicate_service_ids(): void
    {
        $employee = Employee::factory()->create();
        $service = Service::factory()->create();

        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'service_ids' => [$service->id, $service->id],
            'type' => 'percentage',
            'value' => 40,
            'starts_on' => now()->toDateString(),
        ]);

        $response->assertStatus(422);
    }
}
