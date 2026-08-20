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

    /**
     * Settling an advance by hand stops it counting against the commission, so
     * the next payout hands over the full amount — the money is paid twice.
     * It is money-affecting and must carry the same gate as edit/delete.
     */
    public function test_admin_needs_the_patron_password_to_settle_a_single_advance(): void
    {
        $employee = Employee::factory()->create();
        $advance = Advance::create(['employee_id' => $employee->id, 'amount' => 300, 'given_on' => '2026-08-07']);

        Sanctum::actingAs($this->admin());

        $this->postJson("/api/advances/{$advance->id}/settle")->assertUnprocessable();
        $this->assertNull($advance->fresh()->settled_at, "L'avance ne doit pas être réglée sans mot de passe patron.");

        $this->postJson("/api/advances/{$advance->id}/settle", ['password' => 'mauvais'])->assertUnprocessable();
        $this->assertNull($advance->fresh()->settled_at);

        config()->set('services.patron_password', 'le-bon-mot-de-passe');
        $this->postJson("/api/advances/{$advance->id}/settle", ['password' => 'le-bon-mot-de-passe'])->assertOk();
        $this->assertNotNull($advance->fresh()->settled_at);
    }

    public function test_a_settled_advance_cannot_be_settled_again(): void
    {
        $employee = Employee::factory()->create();
        $advance = Advance::create([
            'employee_id' => $employee->id,
            'amount' => 100,
            'given_on' => '2026-08-07',
            'settled_at' => now(),
        ]);

        Sanctum::actingAs($this->superAdmin());
        $this->postJson("/api/advances/{$advance->id}/settle")->assertUnprocessable();
    }

    public function test_employee_can_see_their_own_advances_via_me_endpoint(): void
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id]);
        $otherEmployee = Employee::factory()->create();

        Advance::create([
            'employee_id' => $employee->id,
            'amount' => 150,
            'given_on' => '2026-08-02',
            'reason' => 'avance urgente',
        ]);
        Advance::create([
            'employee_id' => $otherEmployee->id,
            'amount' => 999,
            'given_on' => '2026-08-02',
        ]);

        Sanctum::actingAs($user);
        $response = $this->getJson('/api/me/advances');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals(150, $response->json('data.0.amount'));
        $this->assertEquals(150, $response->json('outstanding_total'));
    }

    public function test_employee_without_a_linked_record_is_forbidden_from_me_advances(): void
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');

        Sanctum::actingAs($user);
        $this->getJson('/api/me/advances')->assertForbidden();
    }

    public function test_employee_cannot_settle_or_edit_their_own_advance_via_the_admin_endpoints(): void
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id]);
        $advance = Advance::create(['employee_id' => $employee->id, 'amount' => 150, 'given_on' => '2026-08-02']);

        Sanctum::actingAs($user);
        $this->postJson("/api/advances/{$advance->id}/settle")->assertForbidden();
        $this->putJson("/api/advances/{$advance->id}", ['amount' => 500])->assertForbidden();
    }
}
