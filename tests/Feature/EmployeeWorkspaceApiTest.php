<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\Sale;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeWorkspaceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_workspace_is_scoped_to_the_logged_in_employee(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $omarUser = User::factory()->create(['role' => 'employee']);
        $yassineUser = User::factory()->create(['role' => 'employee']);
        $omarUser->assignRole('employee');
        $yassineUser->assignRole('employee');

        $omar = Employee::factory()->create(['user_id' => $omarUser->id, 'name' => 'Omar']);
        $yassine = Employee::factory()->create(['user_id' => $yassineUser->id, 'name' => 'Yassine']);
        $client = Client::factory()->create(['name' => 'Client Omar']);

        $omarPrestation = Prestation::create([
            'reference' => 'PRE-2026-000001',
            'client_id' => $client->id,
            'employee_id' => $omar->id,
            'created_by_user_id' => $omarUser->id,
            'status' => Prestation::STATUS_IN_PROGRESS,
            'subtotal' => 70,
            'total' => 70,
        ]);
        $otherPrestation = Prestation::create([
            'reference' => 'PRE-2026-000002',
            'client_id' => Client::factory()->create()->id,
            'employee_id' => $yassine->id,
            'created_by_user_id' => $yassineUser->id,
            'status' => Prestation::STATUS_IN_PROGRESS,
            'subtotal' => 40,
            'total' => 40,
        ]);

        $omarAppointment = Appointment::factory()->create([
            'employee_id' => $omar->id,
            'starts_at' => now()->addHour(),
            'ends_at' => now()->addHours(2),
        ]);
        $yassineAppointment = Appointment::factory()->create([
            'employee_id' => $yassine->id,
            'starts_at' => now()->addHour(),
            'ends_at' => now()->addHours(2),
        ]);

        Sanctum::actingAs($omarUser);

        $this->getJson('/api/me/workspace/prestations')
            ->assertOk()
            ->assertJsonFragment(['id' => $omarPrestation->id])
            ->assertJsonMissing(['id' => $otherPrestation->id]);

        $this->getJson('/api/me/workspace/agenda/'.$omarAppointment->id)
            ->assertOk()
            ->assertJsonPath('data.id', $omarAppointment->id);

        $this->getJson('/api/me/workspace/agenda/'.$yassineAppointment->id)
            ->assertForbidden();
    }

    public function test_employee_workspace_monthly_commission_matches_payroll_source_of_truth(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id]);

        Sale::create([
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'label' => 'Vente caisse legacy',
            'total' => 1000,
            'commission_amount' => 350,
            'payment_method' => 'especes',
            'print_count' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/me/workspace/dashboard')
            ->assertOk()
            ->assertJsonPath('data.today.monthly_commission', 350);
    }
}
