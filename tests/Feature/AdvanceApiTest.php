<?php

namespace Tests\Feature;

use App\Models\Advance;
use App\Models\Employee;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdvanceApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    protected function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    protected function superAdmin(): User
    {
        $user = User::factory()->create(['role' => 'super-admin']);
        $user->assignRole('super-admin');

        return $user;
    }

    public function test_store_can_attribute_an_advance_to_a_specific_past_work_day(): void
    {
        $employee = Employee::factory()->create();
        $today = WorkDay::factory()->create(['status' => 'open']);
        $pastDay = WorkDay::factory()->create(['status' => 'closed', 'date' => now()->subDays(3)->toDateString()]);

        Sanctum::actingAs($this->admin());
        $response = $this->postJson('/api/advances', [
            'employee_id' => $employee->id,
            'amount' => 1500,
            'given_on' => now()->subDays(3)->toDateString(),
            'work_day_id' => $pastDay->id,
        ]);

        $response->assertCreated();
        $this->assertSame($pastDay->id, $response->json('data.work_day_id'));
        $this->assertSame($pastDay->date->toDateString(), $response->json('data.work_day_date'));

        // Not silently overridden to today's open day.
        $this->assertNotEquals($today->id, $response->json('data.work_day_id'));
    }

    public function test_store_defaults_to_the_active_day_when_no_work_day_is_chosen(): void
    {
        $employee = Employee::factory()->create();
        $today = WorkDay::factory()->create(['status' => 'open']);

        Sanctum::actingAs($this->admin());
        $response = $this->postJson('/api/advances', [
            'employee_id' => $employee->id,
            'amount' => 200,
            'given_on' => now()->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertSame($today->id, $response->json('data.work_day_id'));
    }

    public function test_super_admin_can_correct_an_advances_work_day_after_the_fact(): void
    {
        $employee = Employee::factory()->create();
        $wrongDay = WorkDay::factory()->create(['status' => 'open']);
        $correctDay = WorkDay::factory()->create(['status' => 'closed', 'date' => now()->subDays(4)->toDateString()]);
        $advance = Advance::create([
            'employee_id' => $employee->id,
            'work_day_id' => $wrongDay->id,
            'amount' => 1500,
            'given_on' => now()->subDays(4)->toDateString(),
        ]);

        Sanctum::actingAs($this->superAdmin());
        $response = $this->putJson("/api/advances/{$advance->id}", [
            'work_day_id' => $correctDay->id,
        ]);

        $response->assertOk();
        $this->assertSame($correctDay->id, $response->json('data.work_day_id'));
        $this->assertSame($correctDay->date->toDateString(), $response->json('data.work_day_date'));
    }

    public function test_index_exposes_the_work_days_date_for_display(): void
    {
        $employee = Employee::factory()->create();
        $workDay = WorkDay::factory()->create(['status' => 'closed', 'date' => '2026-08-04']);
        Advance::create([
            'employee_id' => $employee->id,
            'work_day_id' => $workDay->id,
            'amount' => 100,
            'given_on' => '2026-08-04',
        ]);

        Sanctum::actingAs($this->admin());
        $response = $this->getJson("/api/advances?employee_id={$employee->id}");

        $response->assertOk();
        $this->assertSame('2026-08-04', $response->json('data.0.work_day_date'));
    }

    public function test_super_admin_can_bulk_settle_advances_given_before_a_cutoff(): void
    {
        $employee = Employee::factory()->create();
        $old1 = Advance::create(['employee_id' => $employee->id, 'amount' => 20, 'given_on' => '2026-07-28']);
        $old2 = Advance::create(['employee_id' => $employee->id, 'amount' => 30, 'given_on' => '2026-07-30']);
        $current = Advance::create(['employee_id' => $employee->id, 'amount' => 40, 'given_on' => '2026-08-02']);
        $alreadySettled = Advance::create([
            'employee_id' => $employee->id,
            'amount' => 15,
            'given_on' => '2026-07-15',
            'settled_at' => now(),
        ]);

        Sanctum::actingAs($this->superAdmin());
        $response = $this->postJson('/api/advances/settle-before', [
            'employee_id' => $employee->id,
            'before' => '2026-08-01',
        ]);

        $response->assertOk();
        $this->assertSame(2, $response->json('settled_count'));
        $this->assertEquals(50.0, $response->json('settled_total'));

        $this->assertNotNull($old1->fresh()->settled_at);
        $this->assertNotNull($old2->fresh()->settled_at);
        $this->assertNull($current->fresh()->settled_at);
        // Untouched — it was already settled before this call.
        $this->assertEqualsWithDelta(
            $alreadySettled->fresh()->settled_at->timestamp,
            $alreadySettled->settled_at->timestamp,
            2,
        );
        // No payout was fabricated for money that was reimbursed off-app.
        $this->assertDatabaseCount('commission_payouts', 0);
    }

    public function test_admin_needs_the_patron_password_to_bulk_settle_advances(): void
    {
        $employee = Employee::factory()->create();
        $old = Advance::create(['employee_id' => $employee->id, 'amount' => 20, 'given_on' => '2026-07-28']);

        Sanctum::actingAs($this->admin());
        $response = $this->postJson('/api/advances/settle-before', [
            'employee_id' => $employee->id,
            'before' => '2026-08-01',
        ]);

        $response->assertUnprocessable();
        $this->assertNull($old->fresh()->settled_at);
    }
}
