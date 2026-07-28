<?php

namespace Tests\Feature;

use App\Models\Advance;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\WorkDay;
use App\Services\WorkDayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WorkDayServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_close_day_computes_closing_report_with_expected_shape(): void
    {
        $employee = Employee::factory()->create(['name' => 'Sofia Martins']);
        $client = Client::factory()->create();

        $workDay = WorkDay::factory()->create([
            'status' => 'open',
            'opening_balance' => 500,
        ]);

        $saleOne = Sale::create([
            'work_day_id' => $workDay->id,
            'client_id' => $client->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 50,
            'commission_amount' => 20,
            'payment_method' => 'especes',
        ]);

        SaleItem::create([
            'sale_id' => $saleOne->id,
            'itemable_type' => null,
            'itemable_id' => null,
            'label' => 'Coupe + Barbe',
            'quantity' => 1,
            'unit_price' => 50,
        ]);

        $saleTwo = Sale::create([
            'work_day_id' => $workDay->id,
            'client_id' => null,
            'client_label' => 'Client de passage',
            'employee_id' => $employee->id,
            'category' => 'hammam',
            'total' => 150,
            'commission_amount' => null,
            'payment_method' => 'carte',
        ]);

        SaleItem::create([
            'sale_id' => $saleTwo->id,
            'itemable_type' => null,
            'itemable_id' => null,
            'label' => 'Hammam Classique',
            'quantity' => 1,
            'unit_price' => 150,
        ]);

        Expense::factory()->create([
            'work_day_id' => $workDay->id,
            'amount' => 40,
        ]);

        Advance::factory()->create([
            'employee_id' => $employee->id,
            'work_day_id' => $workDay->id,
            'amount' => 30,
        ]);

        $service = app(WorkDayService::class);
        $closed = $service->closeDay($workDay);

        $this->assertSame('closed', $closed->status);
        $this->assertNotNull($closed->closed_at);
        $this->assertIsArray($closed->closing_report);

        $report = $closed->closing_report;

        $expectedKeys = [
            'revenue_total',
            'expenses_total',
            'advances_total',
            'commissions_total',
            'net_result',
            'clients_count',
            'average_ticket',
            'revenue_by_category',
            'revenue_by_employee',
            'top_prestations',
        ];

        foreach ($expectedKeys as $key) {
            $this->assertArrayHasKey($key, $report);
        }

        $this->assertEquals(200.0, $report['revenue_total']);
        $this->assertEquals(40.0, $report['expenses_total']);
        $this->assertEquals(30.0, $report['advances_total']);
        $this->assertEquals(20.0, $report['commissions_total']);
        $this->assertEquals(200.0 - 40.0 - 30.0 - 20.0, $report['net_result']);
        $this->assertSame(2, $report['clients_count']);
        $this->assertEquals(100.0, $report['average_ticket']);

        $this->assertCount(2, $report['revenue_by_category']);
        $this->assertCount(1, $report['revenue_by_employee']);
        $this->assertSame($employee->id, $report['revenue_by_employee'][0]['employee_id']);
        $this->assertSame('Sofia Martins', $report['revenue_by_employee'][0]['employee_name']);

        $this->assertNotEmpty($report['top_prestations']);
    }

    public function test_close_day_throws_when_already_closed(): void
    {
        $workDay = WorkDay::factory()->create([
            'status' => 'closed',
            'closed_at' => now(),
            'closing_report' => ['revenue_total' => 0],
        ]);

        $this->expectException(\App\Exceptions\DayAlreadyClosedException::class);

        app(WorkDayService::class)->closeDay($workDay);
    }

    public function test_open_day_throws_when_a_day_is_already_open(): void
    {
        WorkDay::factory()->create(['status' => 'open']);

        $this->expectException(\App\Exceptions\DayAlreadyOpenException::class);

        app(WorkDayService::class)->openDay(['opening_balance' => 100]);
    }

    public function test_closed_day_pdf_route_returns_a_report_response(): void
    {
        Sanctum::actingAs(\App\Models\User::factory()->create());

        $day = WorkDay::factory()->create([
            'status' => 'closed',
            'closed_at' => now(),
            'closing_report' => ['revenue_total' => 0],
        ]);

        $this->get('/api/work-days/'.$day->id.'/pdf')->assertOk();
    }
}
