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

    public function test_store_defaults_to_the_active_day_ignoring_a_backdated_spent_on(): void
    {
        $today = WorkDay::factory()->create(['status' => 'open']);

        $response = $this->postJson('/api/expenses', [
            'label' => 'Fournitures',
            'category' => 'achats',
            'amount' => 40,
            'spent_on' => now()->subDays(3)->toDateString(),
        ]);

        $response->assertCreated();
        // This is exactly the bug being fixed: without an explicit work_day_id,
        // a backdated expense still lands on today's open day.
        $this->assertSame($today->id, $response->json('data.work_day_id'));
    }

    public function test_store_can_attribute_an_expense_to_a_specific_past_work_day(): void
    {
        WorkDay::factory()->create(['status' => 'open', 'date' => now()->toDateString()]);
        $pastDay = WorkDay::factory()->create(['status' => 'closed', 'date' => now()->subDays(4)->toDateString()]);

        $response = $this->postJson('/api/expenses', [
            'label' => 'Fournitures',
            'category' => 'achats',
            'amount' => 40,
            'spent_on' => now()->subDays(4)->toDateString(),
            'work_day_id' => $pastDay->id,
        ]);

        $response->assertCreated();
        $this->assertSame($pastDay->id, $response->json('data.work_day_id'));
        $this->assertSame($pastDay->date->toDateString(), $response->json('data.work_day_date'));
    }

    public function test_update_can_re_attribute_an_existing_expense_to_the_correct_day(): void
    {
        $wrongDay = WorkDay::factory()->create(['status' => 'open', 'date' => now()->toDateString()]);
        $correctDay = WorkDay::factory()->create(['status' => 'closed', 'date' => now()->subDays(4)->toDateString()]);
        $expense = Expense::create([
            'work_day_id' => $wrongDay->id,
            'label' => 'avance omar',
            'category' => 'autre',
            'amount' => 1300,
            'spent_on' => now()->subDays(4)->toDateString(),
        ]);

        $response = $this->putJson("/api/expenses/{$expense->id}", [
            'work_day_id' => $correctDay->id,
        ]);

        $response->assertOk();
        $this->assertSame($correctDay->id, $response->json('data.work_day_id'));
        $this->assertSame($correctDay->date->toDateString(), $response->json('data.work_day_date'));

        // The wrong day's report no longer carries this amount.
        $wrongDayExpenses = $this->getJson("/api/expenses?work_day_id={$wrongDay->id}");
        $this->assertCount(0, $wrongDayExpenses->json('data'));
    }

    public function test_index_can_filter_by_a_spent_on_date_range(): void
    {
        $workDay = WorkDay::factory()->create(['status' => 'open', 'date' => now()->toDateString()]);
        Expense::create([
            'work_day_id' => $workDay->id,
            'label' => 'Dans la période',
            'category' => 'achats',
            'amount' => 50,
            'spent_on' => now()->subDays(10)->toDateString(),
        ]);
        Expense::create([
            'work_day_id' => $workDay->id,
            'label' => 'Hors période',
            'category' => 'achats',
            'amount' => 75,
            'spent_on' => now()->subDays(60)->toDateString(),
        ]);

        $response = $this->getJson('/api/expenses?' . http_build_query([
            'from' => now()->subDays(15)->toDateString(),
            'to' => now()->toDateString(),
        ]));

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Dans la période', $response->json('data.0.label'));
    }
}
