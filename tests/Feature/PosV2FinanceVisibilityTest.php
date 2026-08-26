<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Prestation;
use App\Models\Sale;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * V2.1 — financial visibility: backend commission previews on open
 * invoices (§4/§19/§20), tip beneficiaries restricted to the invoice's own
 * employees (§6/§10), and printing counters (§13-§14).
 */
class PosV2FinanceVisibilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        WorkDay::factory()->create(['status' => 'open']);

        $user = User::factory()->create(['role' => 'super-admin']);
        $user->assignRole('super-admin');
        Sanctum::actingAs($user);
    }

    // ------------------------------------------------------------------
    // §4/§20 — commission preview from the backend resolver
    // ------------------------------------------------------------------

    public function test_open_invoice_lines_carry_a_backend_commission_estimate(): void
    {
        $kamal = Employee::factory()->create(['name' => 'Kamal', 'default_commission_rate' => 20]);
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);
        // A per-service rule beats the default rate — the estimate must come
        // from the same CommissionResolver the checkout uses, not from JS.
        EmployeeServiceCommission::create([
            'employee_id' => $kamal->id,
            'service_id' => $hammam->id,
            'type' => 'fixed',
            'value' => 30,
            'starts_on' => now()->subMonth()->toDateString(),
            'is_active' => true,
        ]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $hammam->id, 'employee_id' => $kamal->id]],
        ])->assertCreated()->json('data');

        $this->assertSame(Prestation::STATUS_IN_PROGRESS, $invoice['status']);
        $this->assertNull($invoice['items'][0]['commission_amount']);
        $this->assertEquals(30.0, $invoice['items'][0]['estimated_commission']);
    }

    public function test_the_estimate_matches_the_frozen_commission_after_checkout(): void
    {
        $zouhir = Employee::factory()->create(['name' => 'Zouhir', 'default_commission_rate' => 20]);
        $massage = Service::factory()->create(['name' => 'Massage sportif', 'category' => 'massage', 'price' => 100]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $massage->id, 'employee_id' => $zouhir->id]],
        ])->json('data');
        $estimated = $invoice['items'][0]['estimated_commission'];
        $this->assertEquals(20.0, $estimated);

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'carte',
        ])->assertOk()->json('data');

        // §20/§32.14 — same resolver, same base: preview === frozen value.
        $this->assertEquals($estimated, $paid['items'][0]['commission_amount']);
        $this->assertNull($paid['items'][0]['estimated_commission']);
        $this->assertEquals($estimated, (float) Sale::find($paid['sale_id'])->commission_amount);
    }

    public function test_free_subscription_lines_have_no_pre_checkout_estimate(): void
    {
        // Free lines resolve their commission basis only at checkout — the
        // resource must not guess.
        $employee = Employee::factory()->create(['default_commission_rate' => 20]);
        $service = Service::factory()->create(['price' => 100]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id, 'unit_price' => 0]],
        ])->json('data');

        // Normal 0-priced line still estimates (0 base -> 0.0), never null.
        $this->assertEquals(0.0, $invoice['items'][0]['estimated_commission']);
    }

    // ------------------------------------------------------------------
    // §6/§10 — tips restricted to the invoice's own employees
    // ------------------------------------------------------------------

    public function test_a_tip_for_an_employee_not_on_the_invoice_is_refused(): void
    {
        $kamal = Employee::factory()->create(['name' => 'Kamal']);
        $outsider = Employee::factory()->create(['name' => 'Ayoub']);
        $service = Service::factory()->create(['price' => 150]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $kamal->id]],
        ])->json('data');

        $response = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
            'tips' => [['employee_id' => $outsider->id, 'amount' => 20]],
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('présent sur cette facture', $response->json('message'));
        $this->assertSame(0, Sale::count());

        // The invoice's own employee is of course accepted.
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
            'tips' => [['employee_id' => $kamal->id, 'amount' => 20]],
        ])->assertOk();
    }

    // ------------------------------------------------------------------
    // §13-§14 — printing available right after checkout and from history
    // ------------------------------------------------------------------

    public function test_print_counters_increment_on_the_invoice_and_its_sale(): void
    {
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');
        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'carte',
        ])->json('data');

        $this->assertSame(1, $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/print")->assertOk()->json('data.print_count'));
        // Reprint from history — second print keeps counting on both tables.
        $this->assertSame(2, $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/print")->assertOk()->json('data.print_count'));
        $this->assertSame(2, Sale::find($paid['sale_id'])->print_count);
    }
}
