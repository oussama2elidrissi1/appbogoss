<?php

namespace Tests\Feature;

use App\Models\Advance;
use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommissionPayoutApiTest extends TestCase
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

    /** A validated Prestation-workflow commission for this employee, dated within the given month. */
    protected function makePrestationCommission(Employee $employee, User $admin, float $amount, string $onDate): void
    {
        $service = Service::factory()->create();
        $prestation = Prestation::create([
            'reference' => 'PRE-TEST-'.uniqid(),
            'employee_id' => $employee->id,
            'created_by_user_id' => $admin->id,
            'status' => Prestation::STATUS_PAID,
            'total' => $amount * 2,
        ]);
        $prestation->created_at = $onDate;
        $prestation->save();
        $item = PrestationItem::create([
            'prestation_id' => $prestation->id,
            'service_id' => $service->id,
            'label' => $service->name,
            'quantity' => 1,
            'unit_price' => $amount * 2,
            'commission_amount' => $amount,
        ]);
        $commission = Commission::create([
            'prestation_id' => $prestation->id,
            'prestation_item_id' => $item->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'fixed',
            'rate_or_amount' => $amount,
            'base_amount' => $amount * 2,
            'amount' => $amount,
            'status' => Commission::STATUS_VALIDATED,
        ]);
        $commission->created_at = $onDate;
        $commission->save();
    }

    public function test_index_previews_commission_and_net_amount_for_every_employee(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makePrestationCommission($employee, $admin, 100, '2026-08-10');

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/commission-payouts?period=2026-08');

        $response->assertOk();
        $row = collect($response->json('data'))->firstWhere('employee_id', $employee->id);
        $this->assertNotNull($row);
        $this->assertEquals(100, $row['commission_total']);
        $this->assertEquals(0, $row['advances_outstanding']);
        $this->assertEquals(100, $row['net_amount']);
        $this->assertFalse($row['already_paid']);
    }

    public function test_index_blends_legacy_sale_commissions_into_the_total(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $sale = Sale::create([
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 80,
            'commission_amount' => 40,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $sale->created_at = '2026-08-05';
        $sale->save();
        SaleItem::create(['sale_id' => $sale->id, 'label' => 'Barbe simple', 'quantity' => 1, 'unit_price' => 80]);

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/commission-payouts?period=2026-08');

        $response->assertOk();
        $row = collect($response->json('data'))->firstWhere('employee_id', $employee->id);
        $this->assertEquals(40, $row['commission_total']);
    }

    public function test_outstanding_advances_reduce_the_net_amount(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makePrestationCommission($employee, $admin, 100, '2026-08-10');
        Advance::create(['employee_id' => $employee->id, 'amount' => 30, 'given_on' => '2026-08-03']);

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/commission-payouts?period=2026-08');

        $row = collect($response->json('data'))->firstWhere('employee_id', $employee->id);
        $this->assertEquals(100, $row['commission_total']);
        $this->assertEquals(30, $row['advances_outstanding']);
        $this->assertEquals(70, $row['net_amount']);
    }

    public function test_paying_settles_the_outstanding_advances_and_records_the_payout(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makePrestationCommission($employee, $admin, 100, '2026-08-10');
        $advance = Advance::create(['employee_id' => $employee->id, 'amount' => 30, 'given_on' => '2026-08-03']);

        Sanctum::actingAs($admin);
        $response = $this->postJson('/api/commission-payouts', [
            'employee_id' => $employee->id,
            'period' => '2026-08',
        ]);

        $response->assertCreated();
        $this->assertEquals(100, $response->json('data.commission_total'));
        $this->assertEquals(30, $response->json('data.advances_deducted'));
        $this->assertEquals(70, $response->json('data.net_amount'));

        $advance->refresh();
        $this->assertNotNull($advance->settled_at);
        $this->assertEquals($response->json('data.id'), $advance->commission_payout_id);

        $this->assertDatabaseHas('commission_payouts', [
            'employee_id' => $employee->id,
            'period' => '2026-08',
            'net_amount' => 70,
        ]);
    }

    public function test_cannot_pay_the_same_employee_and_period_twice(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makePrestationCommission($employee, $admin, 100, '2026-08-10');

        Sanctum::actingAs($admin);
        $this->postJson('/api/commission-payouts', ['employee_id' => $employee->id, 'period' => '2026-08'])
            ->assertCreated();

        $second = $this->postJson('/api/commission-payouts', ['employee_id' => $employee->id, 'period' => '2026-08']);
        $second->assertStatus(422);
        $this->assertSame(1, \App\Models\CommissionPayout::where('employee_id', $employee->id)->count());
    }

    public function test_cannot_pay_when_outstanding_advances_exceed_commission_earned(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makePrestationCommission($employee, $admin, 50, '2026-08-10');
        Advance::create(['employee_id' => $employee->id, 'amount' => 200, 'given_on' => '2026-08-03']);

        Sanctum::actingAs($admin);
        $response = $this->postJson('/api/commission-payouts', ['employee_id' => $employee->id, 'period' => '2026-08']);

        $response->assertStatus(422);
        $this->assertSame(0, \App\Models\CommissionPayout::count());
    }

    public function test_an_older_unsettled_advance_still_reduces_a_later_months_payout(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        // Advance given in July, never settled — must still count against August's payout.
        Advance::create(['employee_id' => $employee->id, 'amount' => 20, 'given_on' => '2026-07-15']);
        $this->makePrestationCommission($employee, $admin, 100, '2026-08-10');

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/commission-payouts?period=2026-08');

        $row = collect($response->json('data'))->firstWhere('employee_id', $employee->id);
        $this->assertEquals(20, $row['advances_outstanding']);
        $this->assertEquals(80, $row['net_amount']);
    }

    public function test_employee_role_cannot_access_commission_payouts(): void
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');

        Sanctum::actingAs($user);
        $this->getJson('/api/commission-payouts')->assertForbidden();
        $this->postJson('/api/commission-payouts', ['employee_id' => 1, 'period' => '2026-08'])->assertForbidden();
    }
}
