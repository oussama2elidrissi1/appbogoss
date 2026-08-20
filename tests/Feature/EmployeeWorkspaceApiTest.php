<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Advance;
use App\Models\Client;
use App\Models\CommissionPayout;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeWorkspaceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_workspace_is_scoped_to_the_logged_in_employee(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $omarUser = User::factory()->create(['role' => 'employee']);
        $yassineUser = User::factory()->create(['role' => 'employee']);
        $omarUser->assignRole('employee');
        $yassineUser->assignRole('employee');

        $omar = Employee::factory()->create(['user_id' => $omarUser->id, 'name' => 'Omar']);
        $yassine = Employee::factory()->create(['user_id' => $yassineUser->id, 'name' => 'Yassine']);
        $client = Client::factory()->create(['name' => 'Client Omar']);

        $omarPrestation = Prestation::create([
            'reference' => 'PRE-2026-000001',
            'client_id' => $client->id,
            'employee_id' => $omar->id,
            'created_by_user_id' => $omarUser->id,
            'status' => Prestation::STATUS_IN_PROGRESS,
            'subtotal' => 70,
            'total' => 70,
        ]);
        $otherPrestation = Prestation::create([
            'reference' => 'PRE-2026-000002',
            'client_id' => Client::factory()->create()->id,
            'employee_id' => $yassine->id,
            'created_by_user_id' => $yassineUser->id,
            'status' => Prestation::STATUS_IN_PROGRESS,
            'subtotal' => 40,
            'total' => 40,
        ]);

        $omarAppointment = Appointment::factory()->create([
            'employee_id' => $omar->id,
            'starts_at' => now()->addHour(),
            'ends_at' => now()->addHours(2),
        ]);
        $yassineAppointment = Appointment::factory()->create([
            'employee_id' => $yassine->id,
            'starts_at' => now()->addHour(),
            'ends_at' => now()->addHours(2),
        ]);

        Sanctum::actingAs($omarUser);

        $this->getJson('/api/me/workspace/prestations')
            ->assertOk()
            ->assertJsonFragment(['id' => $omarPrestation->id])
            ->assertJsonMissing(['id' => $otherPrestation->id]);

        $this->getJson('/api/me/workspace/agenda/'.$omarAppointment->id)
            ->assertOk()
            ->assertJsonPath('data.id', $omarAppointment->id);

        $this->getJson('/api/me/workspace/agenda/'.$yassineAppointment->id)
            ->assertForbidden();
    }

    /**
     * A multi-service prestation can carry commission rows for SEVERAL
     * employees. The history's "Commission" column must show only the
     * logged-in employee's validated share — summing every row made the
     * history disagree with the day/month KPIs (440 vs 400 on production).
     */
    public function test_prestation_history_shows_only_this_employees_validated_commission(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $omarUser = User::factory()->create(['role' => 'employee']);
        $omarUser->assignRole('employee');
        $omar = Employee::factory()->create(['user_id' => $omarUser->id, 'name' => 'Omar']);
        $colleague = Employee::factory()->create(['name' => 'Collègue']);

        $prestation = Prestation::create([
            'reference' => 'PRE-2026-000010',
            'client_id' => Client::factory()->create()->id,
            'employee_id' => $omar->id,
            'created_by_user_id' => $omarUser->id,
            'status' => Prestation::STATUS_PAID,
            'subtotal' => 160,
            'total' => 160,
        ]);

        $service = \App\Models\Service::factory()->create();
        $makeItem = fn () => \App\Models\PrestationItem::create([
            'prestation_id' => $prestation->id,
            'service_id' => $service->id,
            'label' => $service->name,
            'quantity' => 1,
            'unit_price' => 80,
        ]);
        $makeCommission = fn (Employee $employee, float $amount, string $status) => \App\Models\Commission::create([
            'prestation_id' => $prestation->id,
            'prestation_item_id' => $makeItem()->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'rate_or_amount' => 50,
            'base_amount' => $amount * 2,
            'amount' => $amount,
            'status' => $status,
        ]);

        // Omar's validated share.
        $makeCommission($omar, 40, \App\Models\Commission::STATUS_VALIDATED);
        // A colleague's share on the same prestation — must NOT appear in omar's column.
        $makeCommission($colleague, 40, \App\Models\Commission::STATUS_VALIDATED);
        // A cancelled row for omar — must not count either.
        $makeCommission($omar, 10, \App\Models\Commission::STATUS_CANCELLED);

        Sanctum::actingAs($omarUser);

        $today = now()->toDateString();
        $rows = $this->getJson("/api/me/workspace/prestations?from={$today}&to={$today}")
            ->assertOk()
            ->json('data');

        $row = collect($rows)->firstWhere('id', $prestation->id);
        $this->assertNotNull($row);
        $this->assertEquals(40.0, $row['commission']);

        // The dashboard's per-prestation list applies the same rule.
        $dashboard = $this->getJson('/api/me/workspace/dashboard')->assertOk()->json('data');
        $dashboardRow = collect($dashboard['prestations_today'])->firstWhere('id', $prestation->id);
        $this->assertNotNull($dashboardRow);
        $this->assertEquals(40.0, $dashboardRow['commission']);

        // Same for the CA: the colleague's 80 MAD item must not count in
        // omar's revenue — 160 (ticket) − 80 (colleague's item) = 80.
        $this->assertEquals(80.0, $dashboard['today']['revenue']);

        $statistics = $this->getJson('/api/me/workspace/statistics')->assertOk()->json('data');
        $this->assertEquals(80.0, $statistics['kpis']['revenue']);
    }

    public function test_employee_workspace_monthly_commission_matches_payroll_source_of_truth(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id]);

        Sale::create([
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'label' => 'Vente caisse legacy',
            'total' => 1000,
            'commission_amount' => 350,
            'payment_method' => 'especes',
            'print_count' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/me/workspace/dashboard')
            ->assertOk()
            ->assertJsonPath('data.today.monthly_commission', 350);
    }

    public function test_employee_dashboard_and_prestation_history_include_today_caisse_sales(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id, 'name' => 'brahim']);
        $otherEmployee = Employee::factory()->create();
        $client = Client::factory()->create(['name' => 'Client caisse']);

        $saleA = Sale::factory()->create([
            'employee_id' => $employee->id,
            'client_id' => $client->id,
            'total' => 300,
            'commission_amount' => 150,
        ]);
        SaleItem::create(['sale_id' => $saleA->id, 'label' => 'Hammam turc', 'quantity' => 2, 'unit_price' => 150]);

        $saleB = Sale::factory()->create([
            'employee_id' => $employee->id,
            'client_id' => null,
            'client_label' => 'Client de passage',
            'total' => 400,
            'commission_amount' => 200,
        ]);
        SaleItem::create(['sale_id' => $saleB->id, 'label' => 'Massage sportif', 'quantity' => 2, 'unit_price' => 200]);

        Sale::factory()->create([
            'employee_id' => $otherEmployee->id,
            'total' => 999,
            'commission_amount' => 999,
        ]);

        Sanctum::actingAs($user);

        $today = now()->toDateString();

        $this->getJson('/api/me/workspace/dashboard')
            ->assertOk()
            ->assertJsonPath('data.today.prestations_count', 2)
            ->assertJsonPath('data.today.revenue', 700)
            ->assertJsonPath('data.today.commission', 350)
            ->assertJsonFragment(['reference' => 'CAISSE-'.$saleA->id])
            ->assertJsonFragment(['service' => 'Massage sportif']);

        $this->getJson("/api/me/workspace/prestations?from={$today}&to={$today}")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['reference' => 'CAISSE-'.$saleB->id]);
    }

    public function test_paid_commission_counts_net_paid_and_settled_advances(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id]);

        Sale::factory()->create([
            'employee_id' => $employee->id,
            'total' => 5000,
            'commission_amount' => 4193,
        ]);

        CommissionPayout::create([
            'employee_id' => $employee->id,
            'period' => now()->format('Y-m'),
            'commission_total' => 4193,
            'advances_deducted' => 1365,
            'net_amount' => 2828,
            'paid_by_user_id' => $user->id,
            'paid_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/me/workspace/dashboard')
            ->assertOk()
            ->assertJsonPath('data.today.monthly_commission', 4193)
            ->assertJsonPath('data.today.paid_commission', 4193);

        $this->getJson('/api/me/workspace/commissions')
            ->assertOk()
            ->assertJsonPath('data.summary.paid', 4193)
            ->assertJsonPath('data.summary.pending', 0);
    }

    public function test_employee_commissions_endpoint_includes_full_advance_and_payout_history(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id]);

        $payout = CommissionPayout::create([
            'employee_id' => $employee->id,
            'period' => '2026-08',
            'commission_total' => 100,
            'advances_deducted' => 50,
            'net_amount' => 50,
            'paid_by_user_id' => $user->id,
            'paid_at' => now(),
        ]);

        Advance::create([
            'employee_id' => $employee->id,
            'amount' => 50,
            'reason' => 'Ancienne avance',
            'given_on' => '2026-07-15',
            'settled_at' => now(),
            'commission_payout_id' => $payout->id,
        ]);

        Advance::create([
            'employee_id' => $employee->id,
            'amount' => 25,
            'reason' => 'Avance en cours',
            'given_on' => '2026-08-19',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/me/workspace/commissions')
            ->assertOk()
            ->assertJsonCount(2, 'data.advances')
            ->assertJsonPath('data.payouts.0.period', '2026-08');
    }
}
