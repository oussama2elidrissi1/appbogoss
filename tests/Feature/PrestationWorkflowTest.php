<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Sale;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\PrestationService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PrestationWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        WorkDay::factory()->create(['status' => 'open']);
    }

    /** @return array{0: Employee, 1: User} */
    protected function employeeWithLogin(string $role = 'employee'): array
    {
        $user = User::factory()->create(['role' => $role]);
        $user->assignRole($role);
        $employee = Employee::factory()->create([
            'user_id' => $user->id,
            'default_commission_rate' => 40,
        ]);

        return [$employee, $user];
    }

    protected function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    public function test_employee_can_create_multi_service_prestation_and_send_it_to_caisse(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $serviceA = Service::factory()->create(['price' => 50]);
        $serviceB = Service::factory()->create(['price' => 80]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/prestations', [
            'items' => [
                ['service_id' => $serviceA->id, 'quantity' => 1],
                ['service_id' => $serviceB->id, 'quantity' => 1],
            ],
        ]);

        $response->assertCreated();
        $prestationId = $response->json('data.id');
        $this->assertSame('in_progress', $response->json('data.status'));
        $this->assertEquals(130, $response->json('data.total'));

        $this->postJson("/api/prestations/{$prestationId}/complete-services")->assertOk();
        $send = $this->postJson("/api/prestations/{$prestationId}/send-to-caisse");
        $send->assertOk();
        $this->assertSame('pending_payment', $send->json('data.status'));

        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $pending = $this->getJson('/api/prestations/pending');
        $pending->assertOk();
        $this->assertCount(1, $pending->json('data'));
        $this->assertSame($prestationId, $pending->json('data.0.id'));
    }

    public function test_admin_confirms_payment_and_commission_is_calculated_correctly(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $service = Service::factory()->create(['price' => 100]);
        $admin = $this->admin();

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id, 'quantity' => 1]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);

        Sanctum::actingAs($admin);
        $response = $this->postJson("/api/prestations/{$prestation->id}/confirm-payment", [
            'payment_method' => 'especes',
        ]);

        $response->assertOk();
        $this->assertSame('paid', $response->json('data.status'));
        $this->assertEquals(40, $response->json('data.total_commission'));

        $this->assertDatabaseHas('sales', ['total' => 100, 'commission_amount' => 40]);
        $this->assertDatabaseHas('commissions', [
            'prestation_id' => $prestation->id,
            'employee_id' => $employee->id,
            'amount' => 40,
            'status' => Commission::STATUS_VALIDATED,
        ]);
    }

    public function test_confirming_payment_creates_a_printable_sale_ticket(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $service = Service::factory()->create(['price' => 60]);
        $admin = $this->admin();

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'carte'], $admin);

        $this->assertNotNull($paid->sale_id);

        Sanctum::actingAs($admin);
        $print = $this->postJson("/api/prestations/{$paid->id}/print");
        $print->assertOk();
        $this->assertSame(1, $print->json('data.print_count'));
    }

    public function test_employee_sees_only_own_prestations_and_commissions(): void
    {
        [$employeeA, $userA] = $this->employeeWithLogin();
        [$employeeB, $userB] = $this->employeeWithLogin();
        $service = Service::factory()->create();

        app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employeeA,
            $userA,
        );
        app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employeeB,
            $userB,
        );

        Sanctum::actingAs($userA);
        $response = $this->getJson('/api/prestations');
        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($employeeA->id, $response->json('data.0.employee_id'));

        $commissions = $this->getJson('/api/me/commissions');
        $commissions->assertOk();
    }

    public function test_employee_cannot_view_another_employees_prestation(): void
    {
        [$employeeA, $userA] = $this->employeeWithLogin();
        [, $userB] = $this->employeeWithLogin();
        $service = Service::factory()->create();

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employeeA,
            $userA,
        );

        Sanctum::actingAs($userB);
        $this->getJson("/api/prestations/{$prestation->id}")->assertForbidden();
    }

    public function test_cancelled_prestation_generates_no_commission(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $service = Service::factory()->create(['price' => 90]);

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );

        Sanctum::actingAs($user);
        $response = $this->postJson("/api/prestations/{$prestation->id}/cancel", [
            'reason' => 'Client absent',
        ]);

        $response->assertOk();
        $this->assertSame('cancelled', $response->json('data.status'));
        $this->assertSame(0, Commission::where('prestation_id', $prestation->id)->count());
        $this->assertSame(0, Sale::count());
    }

    public function test_refund_voids_commission_and_removes_sale_from_revenue(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $service = Service::factory()->create(['price' => 100]);
        $admin = $this->admin();
        $superAdmin = User::factory()->create(['role' => 'super-admin']);
        $superAdmin->assignRole('super-admin');

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        Sanctum::actingAs($superAdmin);
        $response = $this->postJson("/api/prestations/{$paid->id}/refund", [
            'reason' => 'Client insatisfait',
        ]);

        $response->assertOk();
        $this->assertSame('refunded', $response->json('data.status'));
        $this->assertSame(
            Commission::STATUS_CANCELLED,
            Commission::where('prestation_id', $paid->id)->first()->status,
        );
        $this->assertTrue(Sale::withTrashed()->find($paid->sale_id)->trashed());
    }

    public function test_double_confirm_payment_does_not_create_a_second_sale(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $service = Service::factory()->create(['price' => 70]);
        $admin = $this->admin();

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);

        Sanctum::actingAs($admin);
        $this->postJson("/api/prestations/{$prestation->id}/confirm-payment", ['payment_method' => 'especes'])
            ->assertOk();

        $second = $this->postJson("/api/prestations/{$prestation->id}/confirm-payment", ['payment_method' => 'especes']);
        $second->assertStatus(422);

        $this->assertSame(1, Sale::count());
    }

    public function test_employee_cannot_edit_prestation_once_sent_to_caisse(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $service = Service::factory()->create();

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);

        Sanctum::actingAs($user);
        $response = $this->postJson("/api/prestations/{$prestation->id}/items", [
            'service_id' => $service->id,
        ]);

        // The ownership policy denies the action outright once the prestation
        // has left editable status — it never reaches the service-level check.
        $response->assertForbidden();
    }

    public function test_employee_cannot_confirm_payment(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $service = Service::factory()->create();

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);

        Sanctum::actingAs($user);
        $this->postJson("/api/prestations/{$prestation->id}/confirm-payment", ['payment_method' => 'especes'])
            ->assertForbidden();
    }

    public function test_commission_specific_rule_takes_priority_over_employee_default(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $service = Service::factory()->create(['price' => 200]);
        $admin = $this->admin();

        EmployeeServiceCommission::create([
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'fixed',
            'value' => 15,
            'starts_on' => now()->subDay(),
            'ends_on' => null,
            'is_active' => true,
        ]);

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        // Fixed rule (15) must win over the employee's 40% default (which would be 80).
        $this->assertEquals(15, $paid->items->first()->commission_amount);
    }

    public function test_creating_a_prestation_without_an_open_work_day_fails(): void
    {
        WorkDay::query()->update(['status' => 'closed']);
        [$employee, $user] = $this->employeeWithLogin();
        $service = Service::factory()->create();

        $this->expectException(ValidationException::class);

        app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
    }
}
