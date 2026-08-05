<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Expense;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExpenseApiTest extends TestCase
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

    public function test_convert_to_advance_moves_the_amount_and_removes_the_expense(): void
    {
        $employee = Employee::factory()->create();
        $workDay = WorkDay::factory()->create(['status' => 'open']);
        $expense = Expense::create([
            'work_day_id' => $workDay->id,
            'label' => 'avance omar',
            'category' => 'achats',
            'amount' => 1500,
            'spent_on' => '2026-08-03',
        ]);

        $response = $this->postJson("/api/expenses/{$expense->id}/convert-to-advance", [
            'employee_id' => $employee->id,
        ]);

        $response->assertCreated();
        $this->assertSame($employee->id, $response->json('data.employee_id'));
        $this->assertEquals(1500, $response->json('data.amount'));
        $this->assertSame($workDay->id, $response->json('data.work_day_id'));
        $this->assertSame('2026-08-03', $response->json('data.given_on'));
        $this->assertSame('avance omar', $response->json('data.reason'));

        $this->assertDatabaseHas('advances', [
            'employee_id' => $employee->id,
            'work_day_id' => $workDay->id,
            'amount' => 1500,
        ]);
        $this->assertDatabaseMissing('expenses', ['id' => $expense->id]);
    }

    public function test_converting_an_expense_removes_it_from_the_days_expense_total(): void
    {
        $employee = Employee::factory()->create();
        $workDay = WorkDay::factory()->create(['status' => 'open']);
        $expense = Expense::create([
            'work_day_id' => $workDay->id,
            'label' => 'avance BRAHIM',
            'category' => 'autre',
            'amount' => 1000,
            'spent_on' => '2026-08-02',
        ]);
        Expense::create([
            'work_day_id' => $workDay->id,
            'label' => 'Loyer',
            'category' => 'autre',
            'amount' => 200,
            'spent_on' => '2026-08-02',
        ]);

        $this->postJson("/api/expenses/{$expense->id}/convert-to-advance", ['employee_id' => $employee->id])
            ->assertCreated();

        $remaining = $this->getJson("/api/expenses?work_day_id={$workDay->id}");
        $remaining->assertOk();
        $this->assertCount(1, $remaining->json('data'));
        $this->assertEquals(200, collect($remaining->json('data'))->sum('amount'));
    }
}
