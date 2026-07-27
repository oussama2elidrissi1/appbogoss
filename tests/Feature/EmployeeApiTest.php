<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_crud_endpoints_work(): void
    {
        Sanctum::actingAs(User::factory()->create());

        Employee::factory()->create(['name' => 'Inactive Employee', 'is_active' => false]);

        $this->getJson('/api/employees')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $created = $this->postJson('/api/employees', [
            'name' => 'Amelie Rousseau',
            'role' => 'Coiffeuse',
            'email' => 'amelie@example.com',
            'phone' => '0600000000',
            'avatar_color' => '#C8A24C',
            'specialties' => ['Coupe', 'Coloration'],
            'default_commission_rate' => 12.5,
            'is_active' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Amelie Rousseau')
            ->assertJsonPath('data.specialties.0', 'Coupe')
            ->json('data');

        $this->getJson('/api/employees?include_inactive=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->patchJson('/api/employees/'.$created['id'], [
            'role' => 'Manager',
            'is_active' => false,
        ])
            ->assertOk()
            ->assertJsonPath('data.role', 'Manager')
            ->assertJsonPath('data.is_active', false)
            ->assertJsonPath('data.avatar_color', '#C8A24C')
            ->assertJsonPath('data.specialties.0', 'Coupe');

        $this->deleteJson('/api/employees/'.$created['id'])
            ->assertNoContent();

        $this->assertDatabaseMissing('employees', ['id' => $created['id']]);
    }
}
