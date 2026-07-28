<?php

namespace Tests\Feature;

use App\DTOs\DashboardStatsDTO;
use App\Models\Advance;
use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\WorkDay;
use App\Services\DashboardService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_stats_returns_dto_with_expected_shape(): void
    {
        $client = Client::factory()->create();
        $employee = Employee::factory()->create();
        $service = Service::factory()->create();
        Product::factory()->count(3)->create();

        $sale = Sale::factory()->create([
            'client_id' => $client->id,
            'employee_id' => $employee->id,
            'total' => 50,
        ]);

        SaleItem::factory()->create([
            'sale_id' => $sale->id,
            'quantity' => 1,
            'unit_price' => 50,
        ]);

        Appointment::factory()->create([
            'client_id' => $client->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'status' => 'confirmed',
        ]);

        Expense::factory()->create();

        $stats = app(DashboardService::class)->getStats();

        $this->assertInstanceOf(DashboardStatsDTO::class, $stats);

        $array = $stats->toArray();

        $this->assertArrayHasKey('kpis', $array);
        $this->assertArrayHasKey('revenue_series', $array);
        $this->assertArrayHasKey('low_stock_products', $array);
        $this->assertArrayHasKey('recent_activity', $array);
        $this->assertArrayHasKey('appointment_queue', $array);

        $kpiKeys = [
            'revenue_today',
            'revenue_month',
            'revenue_trend_pct',
            'appointments_today',
            'appointments_trend_pct',
            'clients_total',
            'clients_new_this_month',
            'employees_active',
            'expenses_month',
        ];

        foreach ($kpiKeys as $key) {
            $this->assertArrayHasKey($key, $array['kpis']);
        }

        $this->assertCount(14, $array['revenue_series']);
        $this->assertArrayHasKey('date', $array['revenue_series'][0]);
        $this->assertArrayHasKey('revenue', $array['revenue_series'][0]);
        $this->assertArrayHasKey('expenses', $array['revenue_series'][0]);
    }

    public function test_active_day_summary_subtracts_advances_from_estimated_profit(): void
    {
        $employee = Employee::factory()->create();
        $workDay = WorkDay::factory()->create([
            'opening_balance' => 500,
            'status' => 'open',
        ]);

        $workDay->employees()->attach($employee->id, ['present' => true]);

        Sale::factory()->create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'total' => 300,
            'commission_amount' => 40,
        ]);

        Expense::factory()->create([
            'work_day_id' => $workDay->id,
            'amount' => 50,
            'spent_on' => $workDay->date->toDateString(),
        ]);

        Advance::factory()->create([
            'employee_id' => $employee->id,
            'work_day_id' => $workDay->id,
            'amount' => 80,
            'given_on' => $workDay->date->toDateString(),
        ]);

        $activeDay = app(DashboardService::class)->getStats()->toArray()['active_day'];

        $this->assertSame(300.0, $activeDay['revenue_so_far']);
        $this->assertSame(50.0, $activeDay['expenses_so_far']);
        $this->assertSame(80.0, $activeDay['advances_so_far']);
        $this->assertSame(40.0, $activeDay['commissions_so_far']);
        $this->assertSame(130.0, $activeDay['estimated_profit']);
    }

    public function test_revenue_today_uses_active_work_day_not_calendar_day(): void
    {
        $employee = Employee::factory()->create();
        $activeDay = WorkDay::factory()->create([
            'date' => now()->toDateString(),
            'status' => 'open',
        ]);

        Sale::factory()->create([
            'work_day_id' => $activeDay->id,
            'employee_id' => $employee->id,
            'total' => 300,
        ]);

        Sale::factory()->create([
            'work_day_id' => null,
            'employee_id' => $employee->id,
            'total' => 150,
            'created_at' => now(),
        ]);

        $kpis = app(DashboardService::class)->getStats()->toArray()['kpis'];

        $this->assertSame(300.0, $kpis['revenue_today']);
        $this->assertSame(1, $kpis['clients_today']);
    }
}
