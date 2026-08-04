<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * An employee's history at the caisse (Sale rows) often predates their login
 * account — sales recorded by an admin picking them from the employee list,
 * before "Créer un compte" was ever clicked. Once the account is created,
 * that history must show up in the employee's own "Mon espace" immediately,
 * since it was always tied to the same employee_id.
 */
class EmployeeAccountLegacyHistoryTest extends TestCase
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

    public function test_quick_created_account_immediately_sees_pre_existing_sales(): void
    {
        $employee = Employee::factory()->create(['user_id' => null]);
        $workDay = WorkDay::factory()->create(['status' => 'open']);
        $service = Service::factory()->create(['price' => 120]);

        // A sale recorded by an admin against this employee before they ever
        // had a login account — the exact scenario the user described.
        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'service',
            'total' => 120,
            'commission_amount' => 30,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        SaleItem::create([
            'sale_id' => $sale->id,
            'label' => $service->name,
            'quantity' => 1,
            'unit_price' => 120,
        ]);

        Sanctum::actingAs($this->admin());
        $created = $this->postJson("/api/employees/{$employee->id}/quick-create-account");
        $created->assertOk();

        $newUser = User::where('email', $created->json('data.login_email'))->firstOrFail();

        Sanctum::actingAs($newUser);

        $dashboard = $this->getJson('/api/me/dashboard');
        $dashboard->assertOk();
        $this->assertSame(1, $dashboard->json('data.prestations_today_count'));
        $this->assertEquals(120, $dashboard->json('data.revenue_today'));

        $report = $this->getJson('/api/me/report?from='.now()->startOfMonth()->toDateString().'&to='.now()->toDateString());
        $report->assertOk();
        $this->assertEquals(120, $report->json('data.revenue_total'));
        $this->assertEquals(30, $report->json('data.commission_total'));
        $this->assertSame(1, $report->json('data.prestations_count'));
        $this->assertSame('Vente #'.$sale->id, $report->json('data.details.0.reference'));
    }

    public function test_legacy_sale_report_does_not_double_count_a_prestation_linked_sale(): void
    {
        $employee = Employee::factory()->create(['user_id' => null]);
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'service',
            'total' => 50,
            'commission_amount' => 10,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);

        $admin = $this->admin();

        // A Prestation-workflow sale is already linked via prestations.sale_id —
        // it must never be re-counted as a "legacy" standalone sale.
        Prestation::create([
            'reference' => 'PRE-TEST-000001',
            'employee_id' => $employee->id,
            'created_by_user_id' => $admin->id,
            'sale_id' => $sale->id,
            'status' => Prestation::STATUS_PAID,
            'total' => 50,
        ]);

        Sanctum::actingAs($admin);
        $created = $this->postJson("/api/employees/{$employee->id}/quick-create-account");
        $created->assertOk();
        $newUser = User::where('email', $created->json('data.login_email'))->firstOrFail();

        Sanctum::actingAs($newUser);
        $report = $this->getJson('/api/me/report?from='.now()->startOfMonth()->toDateString().'&to='.now()->toDateString());
        $report->assertOk();

        // Only the Prestation-side total counts — the linked Sale is excluded
        // from the legacy merge, so revenue isn't doubled to 100.
        $this->assertEquals(50, $report->json('data.revenue_total'));
        $this->assertSame(1, $report->json('data.prestations_count'));
    }

    public function test_voiding_a_legacy_sale_at_the_caisse_removes_it_from_the_employees_totals_but_keeps_it_marked_deleted(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $workDay = WorkDay::factory()->create(['status' => 'open']);
        $admin = $this->admin();

        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'service',
            'total' => 90,
            'commission_amount' => 20,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/transactions/{$sale->id}")->assertOk();

        Sanctum::actingAs($user);
        $report = $this->getJson('/api/me/report?from='.now()->startOfMonth()->toDateString().'&to='.now()->toDateString());
        $report->assertOk();

        // Excluded from the employee's own stats...
        $this->assertEquals(0, $report->json('data.revenue_total'));
        $this->assertEquals(0, $report->json('data.commission_total'));
        $this->assertSame(0, $report->json('data.prestations_count'));

        // ...but still visible in the detail list, explicitly flagged.
        $this->assertSame(1, count($report->json('data.details')));
        $this->assertTrue($report->json('data.details.0.is_deleted'));
        $this->assertSame('Vente #'.$sale->id, $report->json('data.details.0.reference'));

        $dashboard = $this->getJson('/api/me/dashboard');
        $dashboard->assertOk();
        $this->assertSame(0, $dashboard->json('data.prestations_today_count'));
        $this->assertEquals(0, $dashboard->json('data.revenue_today'));
    }

    public function test_voiding_a_prestation_paid_sale_at_the_caisse_removes_it_from_the_employees_totals_but_keeps_it_marked_deleted(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();

        $sale = Sale::create([
            'employee_id' => $employee->id,
            'category' => 'service',
            'total' => 70,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $prestation = Prestation::create([
            'reference' => 'PRE-TEST-000002',
            'employee_id' => $employee->id,
            'created_by_user_id' => $admin->id,
            'sale_id' => $sale->id,
            'status' => Prestation::STATUS_PAID,
            'total' => 70,
        ]);

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/transactions/{$sale->id}")->assertOk();

        Sanctum::actingAs($user);
        $report = $this->getJson('/api/me/report?from='.now()->startOfMonth()->toDateString().'&to='.now()->toDateString());
        $report->assertOk();

        $this->assertEquals(0, $report->json('data.revenue_total'));
        $detail = collect($report->json('data.details'))->firstWhere('reference', $prestation->reference);
        $this->assertNotNull($detail);
        $this->assertTrue($detail['is_deleted']);
        // The prestation's own workflow status is untouched — only flagged as deleted.
        $this->assertSame('paid', $detail['status']);
    }

    public function test_voiding_a_prestation_paid_sale_at_the_caisse_excludes_its_commission_from_totals_but_keeps_it_listed(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $service = Service::factory()->create();

        $sale = Sale::create([
            'employee_id' => $employee->id,
            'category' => 'service',
            'total' => 50,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $prestation = Prestation::create([
            'reference' => 'PRE-TEST-000003',
            'employee_id' => $employee->id,
            'created_by_user_id' => $admin->id,
            'sale_id' => $sale->id,
            'status' => Prestation::STATUS_PAID,
            'total' => 50,
        ]);
        $item = PrestationItem::create([
            'prestation_id' => $prestation->id,
            'service_id' => $service->id,
            'label' => $service->name,
            'quantity' => 1,
            'unit_price' => 50,
            'commission_amount' => 25,
        ]);
        $commission = Commission::create([
            'prestation_id' => $prestation->id,
            'prestation_item_id' => $item->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'rate_or_amount' => 50,
            'base_amount' => 50,
            'amount' => 25,
            'status' => Commission::STATUS_VALIDATED,
        ]);

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/transactions/{$sale->id}")->assertOk();

        Sanctum::actingAs($user);

        $dashboard = $this->getJson('/api/me/dashboard');
        $dashboard->assertOk();
        $this->assertEquals(0, $dashboard->json('data.commission_today'));
        $this->assertEquals(0, $dashboard->json('data.commission_month'));

        $report = $this->getJson('/api/me/report?from='.now()->startOfMonth()->toDateString().'&to='.now()->toDateString());
        $report->assertOk();
        $this->assertEquals(0, $report->json('data.commission_total'));

        $commissions = $this->getJson('/api/me/commissions');
        $commissions->assertOk();
        $row = collect($commissions->json('data'))->firstWhere('id', $commission->id);
        $this->assertNotNull($row);
        $this->assertTrue($row['is_deleted']);
        // The Commission row itself is untouched (still "validated") — the
        // audit trail is preserved, only the totals exclude it.
        $this->assertSame('validated', $row['status']);
    }

    public function test_dashboard_commission_cards_match_the_report_when_a_legacy_sale_has_a_commission(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 70,
            'commission_amount' => 35,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        SaleItem::create([
            'sale_id' => $sale->id,
            'label' => 'Coupe cheveux + barbe',
            'quantity' => 1,
            'unit_price' => 70,
        ]);

        Sanctum::actingAs($user);

        $dashboard = $this->getJson('/api/me/dashboard');
        $dashboard->assertOk();

        $report = $this->getJson('/api/me/report?from='.now()->startOfMonth()->toDateString().'&to='.now()->toDateString());
        $report->assertOk();

        // The dashboard cards must never silently disagree with "Mon rapport"
        // for the same period — both are driven by the same legacy sale.
        $this->assertEquals(35, $dashboard->json('data.commission_today'));
        $this->assertEquals(35, $dashboard->json('data.commission_month'));
        $this->assertEquals(35, $report->json('data.commission_total'));
    }

    /** @return array{0: Employee, 1: User} */
    private function employeeWithLogin(): array
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id]);

        return [$employee, $user];
    }
}
