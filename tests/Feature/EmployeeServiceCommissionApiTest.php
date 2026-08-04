<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Prestation;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\PrestationService;
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

    public function test_store_retroactively_recalculates_already_paid_prestations_within_the_rules_window(): void
    {
        WorkDay::factory()->create(['status' => 'open']);
        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $employeeUser->id, 'default_commission_rate' => null]);
        $service = Service::factory()->create(['price' => 100]);
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id, 'quantity' => 1]]],
            $employee,
            $employeeUser,
        );
        app(PrestationService::class)->markServicesDone($prestation, $employeeUser);
        app(PrestationService::class)->sendToCaisse($prestation, $employeeUser);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        // No rule existed at payment time and the employee has no default
        // rate — the commission was frozen at 0.
        $item = $paid->items->first();
        $this->assertEquals(0, $item->commission_amount);
        $commissionId = Commission::where('prestation_item_id', $item->id)->value('id');
        $this->assertEquals(0, Commission::find($commissionId)->amount);

        // Backdate the payment so it falls inside a rule created afterward
        // with a starts_on in the past.
        $paid->update(['confirmed_at' => now()->subDays(3)]);

        Sanctum::actingAs($admin);
        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 60,
            'starts_on' => now()->subDays(7)->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertSame(1, $response->json('meta.recalculated_count'));

        $item->refresh();
        $this->assertEquals(60, $item->commission_amount);
        $this->assertEquals('percentage', $item->commission_type);

        $commission = Commission::find($commissionId);
        $this->assertEquals(60, $commission->amount);
        // The audit trail is preserved — still "validated", never touched.
        $this->assertSame(Commission::STATUS_VALIDATED, $commission->status);
    }

    public function test_store_does_not_recalculate_a_payment_outside_the_rules_window(): void
    {
        WorkDay::factory()->create(['status' => 'open']);
        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $employeeUser->id, 'default_commission_rate' => null]);
        $service = Service::factory()->create(['price' => 100]);
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id, 'quantity' => 1]]],
            $employee,
            $employeeUser,
        );
        app(PrestationService::class)->markServicesDone($prestation, $employeeUser);
        app(PrestationService::class)->sendToCaisse($prestation, $employeeUser);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        // Paid well before the new rule's window starts.
        $paid->update(['confirmed_at' => now()->subDays(30)]);
        $item = $paid->items->first();

        Sanctum::actingAs($admin);
        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 60,
            'starts_on' => now()->subDays(7)->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertSame(0, $response->json('meta.recalculated_count'));

        $item->refresh();
        $this->assertEquals(0, $item->commission_amount);
    }

    public function test_store_does_not_resurrect_a_cancelled_commission(): void
    {
        WorkDay::factory()->create(['status' => 'open']);
        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $employeeUser->id, 'default_commission_rate' => 40]);
        $service = Service::factory()->create(['price' => 100]);
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $superAdmin = User::factory()->create(['role' => 'super-admin']);
        $superAdmin->assignRole('super-admin');

        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $service->id, 'quantity' => 1]]],
            $employee,
            $employeeUser,
        );
        app(PrestationService::class)->markServicesDone($prestation, $employeeUser);
        app(PrestationService::class)->sendToCaisse($prestation, $employeeUser);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);
        $paid->update(['confirmed_at' => now()->subDays(3)]);

        $refunded = app(PrestationService::class)->refund($paid, 'Client insatisfait', $superAdmin);
        $item = $refunded->items->first();
        $commissionId = Commission::where('prestation_item_id', $item->id)->value('id');
        $this->assertSame(Commission::STATUS_CANCELLED, Commission::find($commissionId)->status);

        Sanctum::actingAs($admin);
        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 60,
            'starts_on' => now()->subDays(7)->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertSame(0, $response->json('meta.recalculated_count'));
        $this->assertSame(Commission::STATUS_CANCELLED, Commission::find($commissionId)->status);
    }

    public function test_store_retroactively_recalculates_legacy_caisse_sales_matching_the_service_label(): void
    {
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['name' => 'Barbe simple']);
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 40,
            'commission_amount' => null,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $sale->created_at = now()->subDays(3);
        $sale->save();
        SaleItem::create([
            'sale_id' => $sale->id,
            'label' => 'Barbe simple',
            'quantity' => 1,
            'unit_price' => 40,
        ]);

        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->subDays(7)->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertSame(1, $response->json('meta.recalculated_count'));
        $this->assertEquals(20, $sale->fresh()->commission_amount);
    }

    public function test_store_does_not_touch_a_legacy_sale_with_a_different_label(): void
    {
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['name' => 'Barbe simple']);
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 40,
            'commission_amount' => null,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $sale->created_at = now()->subDays(3);
        $sale->save();
        SaleItem::create([
            'sale_id' => $sale->id,
            'label' => 'POUR BOIRE',
            'quantity' => 1,
            'unit_price' => 40,
        ]);

        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->subDays(7)->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertSame(0, $response->json('meta.recalculated_count'));
        $this->assertNull($sale->fresh()->commission_amount);
    }

    public function test_store_does_not_touch_a_deleted_legacy_sale(): void
    {
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['name' => 'Barbe simple']);
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 40,
            'commission_amount' => null,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $sale->created_at = now()->subDays(3);
        $sale->save();
        SaleItem::create([
            'sale_id' => $sale->id,
            'label' => 'Barbe simple',
            'quantity' => 1,
            'unit_price' => 40,
        ]);
        $sale->delete();

        $response = $this->postJson('/api/employee-service-commissions', [
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->subDays(7)->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertSame(0, $response->json('meta.recalculated_count'));
        $this->assertNull(Sale::withTrashed()->find($sale->id)->commission_amount);
    }

    public function test_manual_recalculate_endpoint_fixes_a_rule_that_predates_the_matching_sale(): void
    {
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['name' => 'Barbe simple']);
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        // The rule already exists (e.g. created before this feature shipped,
        // or before the sale it should have caught was even recorded).
        $rule = EmployeeServiceCommission::create([
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->subDays(10)->toDateString(),
            'is_active' => true,
        ]);

        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 40,
            'commission_amount' => null,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $sale->created_at = now()->subDays(3);
        $sale->save();
        SaleItem::create([
            'sale_id' => $sale->id,
            'label' => 'Barbe simple',
            'quantity' => 1,
            'unit_price' => 40,
        ]);

        $response = $this->postJson("/api/employee-service-commissions/{$rule->id}/recalculate");

        $response->assertOk();
        $this->assertSame(1, $response->json('meta.recalculated_count'));
        $this->assertEquals(20, $sale->fresh()->commission_amount);
    }
}
