<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecalculateCommissionsCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function makeBackdatedSale(Employee $employee, Service $service, float $price, ?WorkDay $workDay = null): Sale
    {
        $workDay ??= WorkDay::query()->where('status', 'open')->first() ?? WorkDay::factory()->create(['status' => 'open']);

        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => $price,
            'commission_amount' => null,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $sale->created_at = now()->subDays(3);
        $sale->save();
        SaleItem::create([
            'sale_id' => $sale->id,
            'label' => $service->name,
            'quantity' => 1,
            'unit_price' => $price,
        ]);

        return $sale;
    }

    public function test_backfills_every_rule_that_predates_its_matching_data(): void
    {
        $employeeA = Employee::factory()->create();
        $employeeB = Employee::factory()->create();
        $serviceA = Service::factory()->create(['name' => 'Barbe simple']);
        $serviceB = Service::factory()->create(['name' => 'Coupe simple']);

        EmployeeServiceCommission::create([
            'employee_id' => $employeeA->id,
            'service_id' => $serviceA->id,
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->subDays(10)->toDateString(),
            'is_active' => true,
        ]);
        EmployeeServiceCommission::create([
            'employee_id' => $employeeB->id,
            'service_id' => $serviceB->id,
            'type' => 'fixed',
            'value' => 15,
            'starts_on' => now()->subDays(10)->toDateString(),
            'is_active' => true,
        ]);

        $saleA = $this->makeBackdatedSale($employeeA, $serviceA, 40);
        $saleB = $this->makeBackdatedSale($employeeB, $serviceB, 60);

        $this->artisan('commissions:recalculate')->assertExitCode(0);

        $this->assertEquals(20, $saleA->fresh()->commission_amount);
        $this->assertEquals(15, $saleB->fresh()->commission_amount);
    }

    public function test_employee_option_scopes_the_backfill_to_a_single_employee(): void
    {
        $employeeA = Employee::factory()->create();
        $employeeB = Employee::factory()->create();
        $service = Service::factory()->create(['name' => 'Barbe simple']);

        EmployeeServiceCommission::create([
            'employee_id' => $employeeA->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->subDays(10)->toDateString(),
            'is_active' => true,
        ]);
        EmployeeServiceCommission::create([
            'employee_id' => $employeeB->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->subDays(10)->toDateString(),
            'is_active' => true,
        ]);

        $saleA = $this->makeBackdatedSale($employeeA, $service, 40);
        $saleB = $this->makeBackdatedSale($employeeB, $service, 40);

        $this->artisan('commissions:recalculate', ['--employee' => $employeeA->id])->assertExitCode(0);

        $this->assertEquals(20, $saleA->fresh()->commission_amount);
        $this->assertNull($saleB->fresh()->commission_amount);
    }

    public function test_is_safe_to_run_twice(): void
    {
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['name' => 'Barbe simple']);

        EmployeeServiceCommission::create([
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 50,
            'starts_on' => now()->subDays(10)->toDateString(),
            'is_active' => true,
        ]);
        $sale = $this->makeBackdatedSale($employee, $service, 40);

        $this->artisan('commissions:recalculate')->assertExitCode(0);
        $this->artisan('commissions:recalculate')->assertExitCode(0);

        $this->assertEquals(20, $sale->fresh()->commission_amount);
    }
}
