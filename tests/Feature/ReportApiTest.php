<?php

namespace Tests\Feature;

use App\Models\Advance;
use App\Models\Employee;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_monthly_report_returns_cash_day_totals_and_breakdowns(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $employee = Employee::factory()->create(['name' => 'Sofia']);
        $day = WorkDay::factory()->create([
            'date' => '2026-07-28',
            'opening_balance' => 100,
        ]);
        $sale = Sale::factory()->create([
            'work_day_id' => $day->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 70,
        ]);
        SaleItem::factory()->create([
            'sale_id' => $sale->id,
            'label' => 'Coupe simple',
            'quantity' => 1,
            'unit_price' => 70,
        ]);
        Expense::factory()->create([
            'work_day_id' => $day->id,
            'spent_on' => '2026-07-28',
            'category' => 'fournitures',
            'amount' => 20,
        ]);
        Advance::factory()->create([
            'work_day_id' => $day->id,
            'employee_id' => $employee->id,
            'given_on' => '2026-07-28',
            'amount' => 10,
        ]);

        $this->getJson('/api/reports/monthly?month=2026-07')
            ->assertOk()
            ->assertJsonPath('data.period.month', '2026-07')
            ->assertJsonPath('data.totals.revenue_total', 70)
            ->assertJsonPath('data.totals.expenses_total', 20)
            ->assertJsonPath('data.totals.advances_total', 10)
            ->assertJsonPath('data.totals.employee_by_prestation.0.employee_name', 'Sofia')
            ->assertJsonPath('data.totals.prestation_by_employee.0.label', 'Coupe simple')
            ->assertJsonPath('data.days.0.date', '2026-07-28');
    }
}
