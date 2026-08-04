<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\PrestationService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RoleAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_super_admin_can_access_every_permission_gated_module(): void
    {
        $superAdmin = User::factory()->create(['role' => 'super-admin']);
        $superAdmin->assignRole('super-admin');
        Sanctum::actingAs($superAdmin);

        // Reports (reports.view_all), employees mutation (employees.manage) and
        // activity log (activity_log.view) are all gated — none granted directly
        // to super-admin's permission list, only reachable via Gate::before.
        $this->getJson('/api/reports/monthly')->assertOk();
        $this->getJson('/api/activity-logs')->assertOk();
        $this->postJson('/api/employees', [
            'name' => 'Nouvelle Recrue',
            'role' => 'coiffeuse',
        ])->assertCreated();
    }

    public function test_employee_role_cannot_manage_employees(): void
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->postJson('/api/employees', [
            'name' => 'Intrus',
            'role' => 'coiffeur',
        ])->assertForbidden();
    }

    public function test_disabled_employee_cannot_log_in(): void
    {
        $user = User::factory()->create(['role' => 'employee', 'is_active' => false, 'password' => bcrypt('password123')]);
        $user->assignRole('employee');
        Employee::factory()->create(['user_id' => $user->id]);

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);

        $response->assertStatus(403);
        $this->assertGuest();
    }

    public function test_only_super_admin_can_refund_a_paid_prestation(): void
    {
        WorkDay::factory()->create(['status' => 'open']);
        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $employeeUser->id]);
        $service = Service::factory()->create(['price' => 50]);

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employee,
            $employeeUser,
        );
        app(PrestationService::class)->markServicesDone($prestation, $employeeUser);
        app(PrestationService::class)->sendToCaisse($prestation, $employeeUser);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        // A plain admin has prestations.confirm_payment but not prestations.edit_paid.
        Sanctum::actingAs($admin);
        $this->postJson("/api/prestations/{$paid->id}/refund", ['reason' => 'test'])->assertForbidden();

        $superAdmin = User::factory()->create(['role' => 'super-admin']);
        $superAdmin->assignRole('super-admin');
        Sanctum::actingAs($superAdmin);
        $this->postJson("/api/prestations/{$paid->id}/refund", ['reason' => 'test'])->assertOk();
    }

    public function test_employee_role_cannot_access_admin_only_modules(): void
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        // Company-wide data an employee has no business seeing or touching —
        // the sidebar hides these, but the API must refuse them regardless.
        $this->getJson('/api/dashboard')->assertForbidden();
        $this->getJson('/api/appointments')->assertForbidden();
        $this->getJson('/api/work-days/active')->assertForbidden();
        $this->getJson('/api/transactions?work_day_id=1')->assertForbidden();
        $this->getJson('/api/expenses')->assertForbidden();
        $this->getJson('/api/products')->assertForbidden();
        $this->getJson('/api/advances')->assertForbidden();
        $this->getJson('/api/employees')->assertForbidden();
        $this->postJson('/api/clients', ['name' => 'Intrus'])->assertForbidden();

        // Still allowed: reading the catalog and client list to build a prestation.
        $this->getJson('/api/services')->assertOk();
        $this->getJson('/api/clients')->assertOk();
    }
}
