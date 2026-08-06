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

    public function test_recalculate_all_fixes_every_rule_for_an_employee_in_one_call(): void
    {
        $employee = Employee::factory()->create();
        $otherEmployee = Employee::factory()->create();
        $serviceA = Service::factory()->create(['name' => 'Barbe simple']);
        $serviceB = Service::factory()->create(['name' => 'Coupe simple']);
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        $ruleA = EmployeeServiceCommission::create([
            'employee_id' => $employee->id,
            'service_id' => $serviceA->id,
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->subDays(10)->toDateString(),
            'is_active' => true,
        ]);
        $ruleB = EmployeeServiceCommission::create([
            'employee_id' => $employee->id,
            'service_id' => $serviceB->id,
            'type' => 'percentage',
            'value' => 30,
            'starts_on' => now()->subDays(10)->toDateString(),
            'is_active' => true,
        ]);
        // Belongs to a different employee — must not be touched or counted.
        EmployeeServiceCommission::create([
            'employee_id' => $otherEmployee->id,
            'service_id' => $serviceA->id,
            'type' => 'percentage',
            'value' => 90,
            'starts_on' => now()->subDays(10)->toDateString(),
            'is_active' => true,
        ]);

        $saleA = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 40,
            'commission_amount' => null,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $saleA->created_at = now()->subDays(3);
        $saleA->save();
        SaleItem::create(['sale_id' => $saleA->id, 'label' => 'Barbe simple', 'quantity' => 1, 'unit_price' => 40]);

        $saleB = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 60,
            'commission_amount' => null,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $saleB->created_at = now()->subDays(3);
        $saleB->save();
        SaleItem::create(['sale_id' => $saleB->id, 'label' => 'Coupe simple', 'quantity' => 1, 'unit_price' => 60]);

        $response = $this->postJson('/api/employee-service-commissions/recalculate-all', [
            'employee_id' => $employee->id,
        ]);

        $response->assertOk();
        $this->assertSame(2, $response->json('meta.rules_processed'));
        $this->assertSame(2, $response->json('meta.recalculated_count'));
        $this->assertEquals(20, $saleA->fresh()->commission_amount);
        $this->assertEquals(18, $saleB->fresh()->commission_amount);
    }

    public function test_regularize_commissions_overwrites_paid_prestations_and_legacy_sales_with_a_flat_rate(): void
    {
        WorkDay::factory()->create(['status' => 'open']);
        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $employeeUser->id, 'default_commission_rate' => null]);
        $otherEmployee = Employee::factory()->create();
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
        $item = $paid->items->first();
        $this->assertEquals(0, $item->commission_amount);

        $workDay = WorkDay::query()->where('status', 'open')->first();
        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 40,
            'commission_amount' => null,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);

        // Belongs to a different employee — must never be touched.
        $otherSale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $otherEmployee->id,
            'category' => 'coiffure',
            'total' => 40,
            'commission_amount' => null,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);

        $response = $this->postJson("/api/employees/{$employee->id}/regularize-commissions", [
            'rate' => 50,
        ]);

        $response->assertOk();
        $this->assertSame(1, $response->json('meta.items_updated'));
        $this->assertSame(1, $response->json('meta.sales_updated'));

        $item->refresh();
        $this->assertEquals(50, $item->commission_amount);
        $this->assertEquals('percentage', $item->commission_type);
        // 50% of the sale's own 40 MAD total, not a flat 50 MAD.
        $this->assertEquals(20, $sale->fresh()->commission_amount);
        $this->assertNull($otherSale->fresh()->commission_amount);
    }
}
