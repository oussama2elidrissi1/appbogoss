<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Prestation;
use App\Models\Sale;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BackfillLegacyCommissionsCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function makeSale(Employee $employee, float $total, ?float $commissionAmount = null): Sale
    {
        $workDay = WorkDay::query()->where('status', 'open')->first() ?? WorkDay::factory()->create(['status' => 'open']);

        return Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => $total,
            'commission_amount' => $commissionAmount,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
    }

    public function test_applies_the_default_rate_to_sales_with_no_commission_recorded(): void
    {
        $employee = Employee::factory()->create(['default_commission_rate' => 40]);
        $sale = $this->makeSale($employee, 100);

        $this->artisan('commissions:backfill-legacy')->assertExitCode(0);

        $this->assertEquals(40, $sale->fresh()->commission_amount);
    }

    public function test_does_not_touch_a_sale_that_already_has_a_commission_including_zero(): void
    {
        $employee = Employee::factory()->create(['default_commission_rate' => 40]);
        $alreadySet = $this->makeSale($employee, 100, 15);
        $deliberatelyZero = $this->makeSale($employee, 100, 0);

        $this->artisan('commissions:backfill-legacy')->assertExitCode(0);

        $this->assertEquals(15, $alreadySet->fresh()->commission_amount);
        $this->assertEquals(0, $deliberatelyZero->fresh()->commission_amount);
    }

    public function test_skips_an_employee_with_no_default_rate(): void
    {
        $employee = Employee::factory()->create(['default_commission_rate' => null]);
        $sale = $this->makeSale($employee, 100);

        $this->artisan('commissions:backfill-legacy')->assertExitCode(0);

        $this->assertNull($sale->fresh()->commission_amount);
    }

    public function test_skips_a_sale_already_linked_to_a_prestation(): void
    {
        $employee = Employee::factory()->create(['default_commission_rate' => 40]);
        $sale = $this->makeSale($employee, 100);

        $user = User::factory()->create();
        Prestation::create([
            'reference' => 'PRE-TEST-1',
            'employee_id' => $employee->id,
            'created_by_user_id' => $user->id,
            'status' => 'paid',
            'sale_id' => $sale->id,
        ]);

        $this->artisan('commissions:backfill-legacy')->assertExitCode(0);

        $this->assertNull($sale->fresh()->commission_amount);
    }

    public function test_employee_option_scopes_the_backfill(): void
    {
        $employeeA = Employee::factory()->create(['default_commission_rate' => 40]);
        $employeeB = Employee::factory()->create(['default_commission_rate' => 40]);
        $saleA = $this->makeSale($employeeA, 100);
        $saleB = $this->makeSale($employeeB, 100);

        $this->artisan('commissions:backfill-legacy', ['--employee' => $employeeA->id])->assertExitCode(0);

        $this->assertEquals(40, $saleA->fresh()->commission_amount);
        $this->assertNull($saleB->fresh()->commission_amount);
    }

    public function test_is_safe_to_run_twice(): void
    {
        $employee = Employee::factory()->create(['default_commission_rate' => 40]);
        $sale = $this->makeSale($employee, 100);

        $this->artisan('commissions:backfill-legacy')->assertExitCode(0);
        $this->artisan('commissions:backfill-legacy')->assertExitCode(0);

        $this->assertEquals(40, $sale->fresh()->commission_amount);
    }
}
