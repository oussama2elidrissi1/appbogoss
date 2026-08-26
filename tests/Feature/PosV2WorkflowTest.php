<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use App\Models\Service;
use App\Models\Tip;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\PrestationService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosV2WorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        WorkDay::factory()->create(['status' => 'open']);
    }

    protected function superAdmin(): User
    {
        $user = User::factory()->create(['role' => 'super-admin']);
        $user->assignRole('super-admin');

        return $user;
    }

    protected function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    // ------------------------------------------------------------------
    // Access (§42, §52)
    // ------------------------------------------------------------------

    /** V2.1 §17-§18 — the admin role joins the test phase with the operational set. */
    public function test_admin_can_operate_caisse_v2_but_not_refund_while_v1_keeps_working(): void
    {
        Sanctum::actingAs($this->admin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 70]);

        // Access + full sale flow.
        $this->getJson('/api/pos-v2/dashboard')->assertOk();
        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->assertCreated()->json('data');
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ])->assertOk();
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/print")->assertOk();
        $this->getJson('/api/pos-v2/history')->assertOk();

        // Refund stays super-admin only (mirrors V1's prestations.edit_paid).
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/refund", ['reason' => 'test'])
            ->assertForbidden();

        // V1 stays fully available to the same admin.
        $this->postJson('/api/transactions', [
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'label' => 'Coupe',
            'price' => 70,
        ])->assertCreated();
    }

    public function test_employee_role_cannot_reach_caisse_v2(): void
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->getJson('/api/pos-v2/invoices')->assertForbidden();
    }

    // ------------------------------------------------------------------
    // Invoice lifecycle (§4-§7, §21-§22)
    // ------------------------------------------------------------------

    public function test_open_invoice_add_lines_with_per_line_employees_and_totals_recalc(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $omar = Employee::factory()->create(['name' => 'Omar']);
        $yassine = Employee::factory()->create(['name' => 'Yassine']);
        $coupe = Service::factory()->create(['name' => 'Coupe', 'category' => 'coiffure', 'price' => 70]);
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);

        $created = $this->postJson('/api/pos-v2/invoices', [
            'client_label' => 'Client de passage',
        ])->assertCreated()->json('data');

        $this->assertStringStartsWith('FAC-', $created['reference']);
        $this->assertSame('draft', $created['status']);
        $this->assertTrue($created['is_walk_in']);

        $invoiceId = $created['id'];

        $this->postJson("/api/pos-v2/invoices/{$invoiceId}/lines", [
            'service_id' => $coupe->id,
            'employee_id' => $omar->id,
        ])->assertCreated();

        $after = $this->postJson("/api/pos-v2/invoices/{$invoiceId}/lines", [
            'service_id' => $hammam->id,
            'employee_id' => $yassine->id,
        ])->assertCreated()->json('data');

        $this->assertSame('in_progress', $after['status']);
        $this->assertEquals(220, $after['total']);
        $this->assertCount(2, $after['items']);
        $this->assertSame('Omar', $after['items'][0]['employee_name']);
        $this->assertSame('Yassine', $after['items'][1]['employee_name']);

        // Open invoices board lists it.
        $open = $this->getJson('/api/pos-v2/invoices')->assertOk()->json('data');
        $this->assertCount(1, $open);
        $this->assertSame($invoiceId, $open[0]['id']);

        // Hold / resume.
        $this->postJson("/api/pos-v2/invoices/{$invoiceId}/hold")->assertOk();
        $this->assertTrue($this->getJson('/api/pos-v2/invoices')->json('data.0.held'));
        $this->postJson("/api/pos-v2/invoices/{$invoiceId}/resume")->assertOk();
        $this->assertFalse($this->getJson('/api/pos-v2/invoices')->json('data.0.held'));
    }

    public function test_line_update_and_removal_keep_totals_consistent(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $coupe = Service::factory()->create(['price' => 70]);
        $soin = Service::factory()->create(['price' => 120]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [
                ['service_id' => $coupe->id, 'employee_id' => $employee->id],
                ['service_id' => $soin->id, 'employee_id' => $employee->id],
            ],
        ])->assertCreated()->json('data');

        $this->assertEquals(190, $invoice['total']);

        $lineId = $invoice['items'][0]['id'];
        $updated = $this->patchJson("/api/pos-v2/invoices/{$invoice['id']}/lines/{$lineId}", [
            'quantity' => 2,
        ])->assertOk()->json('data');
        $this->assertEquals(260, $updated['total']);

        $removed = $this->deleteJson("/api/pos-v2/invoices/{$invoice['id']}/lines/{$invoice['items'][1]['id']}")
            ->assertOk()->json('data');
        $this->assertEquals(140, $removed['total']);
    }

    // ------------------------------------------------------------------
    // Checkout (§25-§28, §48)
    // ------------------------------------------------------------------

    public function test_cash_checkout_creates_sale_with_per_line_commissions_and_change(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $omar = Employee::factory()->create(['name' => 'Omar', 'default_commission_rate' => 20]);
        $yassine = Employee::factory()->create(['name' => 'Yassine', 'default_commission_rate' => 50]);
        $coupe = Service::factory()->create(['category' => 'coiffure', 'price' => 70]);
        $massage = Service::factory()->create(['category' => 'massage', 'price' => 250]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [
                ['service_id' => $coupe->id, 'employee_id' => $omar->id],
                ['service_id' => $massage->id, 'employee_id' => $yassine->id],
            ],
        ])->assertCreated()->json('data');

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
            'amount_received' => 400,
            'expected_total' => 320,
        ])->assertOk()->json('data');

        $this->assertSame('paid', $paid['status']);
        $this->assertEquals(320, $paid['total']);
        $this->assertEquals(80, $paid['change_given']);

        $prestation = Prestation::find($invoice['id']);
        $sale = Sale::find($paid['sale_id']);
        $this->assertNotNull($sale);
        $this->assertEquals(320, (float) $sale->total);
        // Multi-category invoice lands in 'autre' — never NULL like V1.
        $this->assertSame('autre', $sale->category);
        // Header/sale employee = first line's employee (never diverging, to
        // keep EmployeeEarningsService's legacy-sale exclusion correct).
        $this->assertSame($omar->id, $sale->employee_id);
        $this->assertSame($omar->id, $prestation->employee_id);

        // One commission per line, each on ITS employee.
        $commissions = Commission::where('prestation_id', $invoice['id'])->get();
        $this->assertCount(2, $commissions);
        $omarCommission = $commissions->firstWhere('employee_id', $omar->id);
        $yassineCommission = $commissions->firstWhere('employee_id', $yassine->id);
        $this->assertEquals(14.0, (float) $omarCommission->amount);   // 70 × 20%
        $this->assertEquals(125.0, (float) $yassineCommission->amount); // 250 × 50%
        $this->assertEquals(139.0, (float) $sale->commission_amount);

        // Invariant G3 fixed for V2: Sale.total === Σ sale_items.
        $itemsSum = $sale->items->sum(fn ($item) => $item->quantity * (float) $item->unit_price);
        $this->assertEquals((float) $sale->total, round($itemsSum, 2));
    }

    public function test_double_click_checkout_is_rejected(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');

        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", ['payment_method' => 'carte'])->assertOk();
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", ['payment_method' => 'carte'])
            ->assertStatus(422);

        $this->assertSame(1, Sale::count());
    }

    public function test_stale_cart_guard_rejects_mismatched_expected_total(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');

        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'carte',
            'expected_total' => 60,
        ])->assertStatus(422);

        $this->assertSame(0, Sale::count());
    }

    public function test_mixed_payment_requires_a_breakdown_that_sums_to_the_total(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 500]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');

        // Wrong sum -> rejected, nothing written.
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'mixte',
            'payment_breakdown' => [
                ['method' => 'especes', 'amount' => 100],
                ['method' => 'carte', 'amount' => 300],
            ],
        ])->assertStatus(422);
        $this->assertSame(0, Sale::count());

        // Correct split -> accepted and persisted.
        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'mixte',
            'payment_breakdown' => [
                ['method' => 'especes', 'amount' => 200],
                ['method' => 'carte', 'amount' => 300],
            ],
        ])->assertOk()->json('data');

        $this->assertSame('mixte', $paid['payment_method']);
        $this->assertEquals(200, $paid['payment_breakdown'][0]['amount']);
        $this->assertEquals(300, $paid['payment_breakdown'][1]['amount']);
    }

    // ------------------------------------------------------------------
    // Discounts (§29)
    // ------------------------------------------------------------------

    public function test_invoice_discount_is_distributed_and_the_sale_items_invariant_holds(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create(['default_commission_rate' => 50]);
        $coupe = Service::factory()->create(['price' => 70]);
        $massage = Service::factory()->create(['price' => 250]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [
                ['service_id' => $coupe->id, 'employee_id' => $employee->id],
                ['service_id' => $massage->id, 'employee_id' => $employee->id],
            ],
        ])->json('data');

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'carte',
            'discount_amount' => 32,
            'discount_reason' => 'Client fidèle',
        ])->assertOk()->json('data');

        $this->assertEquals(288, $paid['total']); // 320 - 32
        $this->assertEquals(32, $paid['discount_amount']);
        $this->assertSame('Client fidèle', $paid['discount_reason']);

        $sale = Sale::find($paid['sale_id']);
        $itemsSum = $sale->items->sum(fn ($item) => $item->quantity * (float) $item->unit_price);
        $this->assertEquals((float) $sale->total, round($itemsSum, 2));
        $this->assertEquals(288.0, (float) $sale->total);

        // Commission base follows what the client actually paid (144 = 288/2 at 50%).
        $this->assertEquals(144.0, (float) $sale->commission_amount);
    }

    public function test_line_discount_reduces_the_total_and_is_capped_by_the_line(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');
        $lineId = $invoice['items'][0]['id'];

        // Over-the-line discount rejected.
        $this->patchJson("/api/pos-v2/invoices/{$invoice['id']}/lines/{$lineId}", [
            'discount_amount' => 150,
        ])->assertStatus(422);

        $updated = $this->patchJson("/api/pos-v2/invoices/{$invoice['id']}/lines/{$lineId}", [
            'discount_amount' => 20,
            'discount_reason' => 'Geste commercial',
        ])->assertOk()->json('data');

        $this->assertEquals(80, $updated['total']);
        $this->assertEquals(20, $updated['items'][0]['discount_amount']);
    }

    // ------------------------------------------------------------------
    // Tips (§13, §40)
    // ------------------------------------------------------------------

    public function test_tips_are_recorded_separately_from_revenue_and_voided_on_refund(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $omar = Employee::factory()->create(['name' => 'Omar']);
        $yassine = Employee::factory()->create(['name' => 'Yassine']);
        $service = Service::factory()->create(['price' => 250]);
        $coupe = Service::factory()->create(['price' => 70]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [
                ['service_id' => $service->id, 'employee_id' => $yassine->id],
                ['service_id' => $coupe->id, 'employee_id' => $omar->id],
            ],
        ])->json('data');

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
            'tips' => [
                ['employee_id' => $yassine->id, 'amount' => 30, 'prestation_item_id' => $invoice['items'][0]['id']],
                ['employee_id' => $omar->id, 'amount' => 20],
            ],
        ])->assertOk()->json('data');

        // Tip money NEVER inflates the sale (§40: pourboire ≠ commission ≠ CA).
        $this->assertEquals(320.0, (float) Sale::find($paid['sale_id'])->total);
        $this->assertEquals(50, $paid['tips_total']);
        $this->assertSame(2, Tip::count());
        $this->assertDatabaseHas('tips', ['employee_id' => $yassine->id, 'amount' => 30]);
        $this->assertDatabaseHas('tips', ['employee_id' => $omar->id, 'amount' => 20]);

        // Refund voids the tips too.
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/refund", ['reason' => 'Erreur de caisse'])->assertOk();
        $this->assertSame(0, Tip::count());
        $this->assertSame(2, Tip::withTrashed()->count());
    }

    public function test_coiffure_tips_generate_a_50_percent_commission_without_inflating_revenue(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $kamal = Employee::factory()->create(['name' => 'Kamal', 'default_commission_rate' => 50]);
        $coupe = Service::factory()->create(['name' => 'Coupe cheveux + barbe', 'category' => 'coiffure', 'price' => 70]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $coupe->id, 'employee_id' => $kamal->id]],
        ])->assertCreated()->json('data');

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
            'tips' => [['employee_id' => $kamal->id, 'amount' => 20]],
        ])->assertOk()->json('data');

        $this->assertEquals(70, $paid['total']);
        $this->assertEquals(45, (float) Sale::find($paid['sale_id'])->commission_amount);
        $this->assertEquals(35, (float) Commission::where('prestation_id', $invoice['id'])->where('type', 'percentage')->sum('amount'));
        $this->assertEquals(10, (float) Commission::where('prestation_id', $invoice['id'])->where('type', 'tip_percentage')->sum('amount'));

        $detail = $this->getJson("/api/pos-v2/invoices/{$invoice['id']}")->assertOk()->json('data');
        $this->assertEquals(45, collect($detail['commissions'])->sum('amount'));
        $this->assertSame($invoice['items'][0]['id'], $detail['tips'][0]['prestation_item_id']);

        $history = $this->getJson('/api/pos-v2/history')->assertOk()->json('meta.stats.employees.0');
        $this->assertSame('Kamal', $history['employee_name']);
        $this->assertEquals(45, $history['commission_total']);
    }

    // ------------------------------------------------------------------
    // Cancel / refund (§32)
    // ------------------------------------------------------------------

    public function test_refund_cancels_commissions_and_soft_deletes_the_sale(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create(['default_commission_rate' => 20]);
        $service = Service::factory()->create(['price' => 100]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');
        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", ['payment_method' => 'carte'])->json('data');

        // Refund requires a reason.
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/refund", [])->assertStatus(422);

        $refunded = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/refund", [
            'reason' => 'Client insatisfait',
        ])->assertOk()->json('data');

        $this->assertSame('refunded', $refunded['status']);
        $this->assertSoftDeleted('sales', ['id' => $paid['sale_id']]);
        $this->assertSame(
            0,
            Commission::where('prestation_id', $invoice['id'])->where('status', Commission::STATUS_VALIDATED)->count(),
        );
    }

    public function test_unpaid_invoice_can_be_cancelled_but_paid_one_cannot(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');

        $cancelled = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/cancel", [
            'reason' => 'Client parti',
        ])->assertOk()->json('data');
        $this->assertSame('cancelled', $cancelled['status']);

        $invoice2 = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');
        $this->postJson("/api/pos-v2/invoices/{$invoice2['id']}/checkout", ['payment_method' => 'carte'])->assertOk();
        $this->postJson("/api/pos-v2/invoices/{$invoice2['id']}/cancel", ['reason' => 'x'])->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // Cross-day invoice books to the CURRENT day (V1's G1 avoided)
    // ------------------------------------------------------------------

    public function test_invoice_opened_yesterday_books_its_sale_on_todays_work_day(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);

        $dayOne = WorkDay::query()->where('status', 'open')->first();

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');

        // The day closes with the invoice still open; a new day starts.
        $dayOne->update(['status' => 'closed', 'closed_at' => now()]);
        $dayTwo = WorkDay::factory()->create([
            'status' => 'open',
            'date' => now()->addDay()->toDateString(),
        ]);

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ])->assertOk()->json('data');

        $this->assertSame($dayTwo->id, Sale::find($paid['sale_id'])->work_day_id);

        $history = $this->getJson("/api/pos-v2/history?work_day_id={$dayTwo->id}")
            ->assertOk()
            ->json('data');
        $this->assertCount(1, $history);
        $this->assertSame($invoice['id'], $history[0]['id']);
    }

    // ------------------------------------------------------------------
    // History & dashboard (§23-§24, §33-§34)
    // ------------------------------------------------------------------

    public function test_history_filters_by_service_employee_and_hour(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $omar = Employee::factory()->create();
        $yassine = Employee::factory()->create();
        $coupe = Service::factory()->create(['name' => 'Coupe', 'category' => 'coiffure', 'price' => 70]);
        $hammam = Service::factory()->create(['name' => 'Hammam', 'category' => 'hammam', 'price' => 150]);

        $first = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $coupe->id, 'employee_id' => $omar->id]],
        ])->json('data');
        $this->postJson("/api/pos-v2/invoices/{$first['id']}/checkout", ['payment_method' => 'especes']);

        $second = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $hammam->id, 'employee_id' => $yassine->id]],
        ])->json('data');
        $this->postJson("/api/pos-v2/invoices/{$second['id']}/checkout", ['payment_method' => 'carte']);

        $all = $this->getJson('/api/pos-v2/history')->assertOk()->json('data');
        $this->assertCount(2, $all);

        $byService = $this->getJson("/api/pos-v2/history?service_id={$coupe->id}")->json('data');
        $this->assertCount(1, $byService);
        $this->assertSame($first['id'], $byService[0]['id']);

        $byEmployee = $this->getJson("/api/pos-v2/history?employee_id={$yassine->id}")->json('data');
        $this->assertCount(1, $byEmployee);
        $this->assertSame($second['id'], $byEmployee[0]['id']);

        $byCategory = $this->getJson('/api/pos-v2/history?category=hammam')->json('data');
        $this->assertCount(1, $byCategory);

        $byPayment = $this->getJson('/api/pos-v2/history?payment_method=carte')->json('data');
        $this->assertCount(1, $byPayment);

        // Hour window that excludes everything.
        $this->assertCount(0, $this->getJson('/api/pos-v2/history?time_from=00:00&time_to=00:01')->json('data'));
    }

    public function test_history_includes_settled_v1_prestations_and_employee_stats(): void
    {
        $admin = $this->superAdmin();
        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');
        $omar = Employee::factory()->create([
            'name' => 'Omar',
            'user_id' => $employeeUser->id,
            'default_commission_rate' => 10,
        ]);
        $yassine = Employee::factory()->create([
            'name' => 'Yassine',
            'default_commission_rate' => 20,
        ]);
        $coupe = Service::factory()->create(['name' => 'Coupe', 'price' => 70]);
        $hammam = Service::factory()->create(['name' => 'Hammam', 'price' => 150]);

        $prestations = app(PrestationService::class);
        $v1 = $prestations->create(['items' => [['service_id' => $coupe->id]]], $omar, $employeeUser);
        $prestations->markServicesDone($v1->fresh(), $employeeUser);
        $prestations->sendToCaisse($v1->fresh(), $employeeUser, false);
        $prestations->confirmPayment($v1->fresh(), ['payment_method' => 'especes'], $admin);

        Sanctum::actingAs($admin);
        $v2 = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $hammam->id, 'employee_id' => $yassine->id]],
        ])->assertCreated()->json('data');
        $this->postJson("/api/pos-v2/invoices/{$v2['id']}/checkout", ['payment_method' => 'carte'])
            ->assertOk();

        $history = $this->getJson('/api/pos-v2/history')->assertOk();
        $references = collect($history->json('data'))->pluck('reference');

        $this->assertTrue($references->contains(fn (string $reference) => str_starts_with($reference, 'PRE-')));
        $this->assertTrue($references->contains(fn (string $reference) => str_starts_with($reference, 'FAC-')));
        $this->assertSame(1, $history->json('meta.stats.v1_count'));
        $this->assertSame(1, $history->json('meta.stats.v2_count'));
        $this->assertEquals(220, $history->json('meta.stats.paid_total'));

        $employees = collect($history->json('meta.stats.employees'))->keyBy('employee_name');
        $this->assertEquals(70, $employees['Omar']['total']);
        $this->assertSame(1, $employees['Omar']['performed_count']);
        $this->assertEquals(150, $employees['Yassine']['total']);
        $this->assertSame(1, $employees['Yassine']['performed_count']);
    }

    public function test_history_stats_include_active_v1_quick_sales_so_day_revenue_matches_caisse_v1(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create(['name' => 'Omar', 'default_commission_rate' => 50]);
        $service = Service::factory()->create(['name' => 'Coupe simple', 'category' => 'coiffure', 'price' => 40]);
        $workDay = WorkDay::query()->where('status', 'open')->firstOrFail();

        $this->postJson('/api/transactions', [
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'category' => 'coiffure',
            'label' => 'Coupe simple',
            'price' => 40,
        ])->assertCreated();

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->assertCreated()->json('data');
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", ['payment_method' => 'carte'])
            ->assertOk();

        $history = $this->getJson("/api/pos-v2/history?work_day_id={$workDay->id}")->assertOk();

        $this->assertEquals(80, $history->json('meta.stats.paid_total'));
        $this->assertSame(2, $history->json('meta.stats.paid_count'));
        $this->assertSame(1, $history->json('meta.stats.v2_count'));
        $this->assertSame(1, $history->json('meta.stats.v1_count'));
        $this->assertEquals(80, $history->json('meta.stats.employees.0.total'));
        $this->assertEquals(40, $history->json('meta.stats.employees.0.commission_total'));
        $this->assertSame(2, $history->json('meta.stats.employees.0.performed_count'));
    }

    public function test_history_uses_linked_sale_employee_for_old_v1_prestations(): void
    {
        $admin = $this->superAdmin();
        Sanctum::actingAs($admin);
        $employee = Employee::factory()->create(['name' => 'Omar']);
        $service = Service::factory()->create(['name' => 'Coupe simple', 'price' => 40]);
        $workDay = WorkDay::query()->where('status', 'open')->firstOrFail();

        $sale = Sale::create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 40,
            'commission_amount' => 20,
            'payment_method' => 'especes',
            'print_count' => 1,
        ]);
        $prestation = Prestation::create([
            'reference' => 'PRE-TEST-LEGACY',
            'employee_id' => null,
            'created_by_user_id' => $admin->id,
            'sale_id' => $sale->id,
            'work_day_id' => $workDay->id,
            'status' => Prestation::STATUS_PAID,
            'total' => 40,
            'payment_method' => 'especes',
            'confirmed_at' => now(),
        ]);
        $item = PrestationItem::create([
            'prestation_id' => $prestation->id,
            'service_id' => $service->id,
            'label' => 'Coupe simple',
            'quantity' => 1,
            'unit_price' => 40,
        ]);
        Commission::create([
            'prestation_id' => $prestation->id,
            'prestation_item_id' => $item->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'rate_or_amount' => 50,
            'base_amount' => 40,
            'amount' => 20,
            'status' => Commission::STATUS_VALIDATED,
        ]);

        $history = $this->getJson("/api/pos-v2/history?work_day_id={$workDay->id}")->assertOk();

        $this->assertEquals(40, $history->json('meta.stats.paid_total'));
        $this->assertSame('Omar', $history->json('meta.stats.employees.0.employee_name'));
        $this->assertEquals(40, $history->json('meta.stats.employees.0.total'));
        $this->assertEquals(20, $history->json('meta.stats.employees.0.commission_total'));
        $this->assertSame('Omar', $history->json('data.0.items.0.employee_name'));
    }

    public function test_deleted_v1_and_v2_sales_stay_visible_but_are_excluded_from_pos_history_stats(): void
    {
        $admin = $this->superAdmin();
        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');
        $employee = Employee::factory()->create([
            'name' => 'Ahmed',
            'user_id' => $employeeUser->id,
            'default_commission_rate' => 50,
        ]);
        $service = Service::factory()->create(['name' => 'Coupe', 'price' => 100]);

        $prestations = app(PrestationService::class);
        $v1 = $prestations->create(['items' => [['service_id' => $service->id]]], $employee, $employeeUser);
        $prestations->markServicesDone($v1->fresh(), $employeeUser);
        $prestations->sendToCaisse($v1->fresh(), $employeeUser, false);
        $prestations->confirmPayment($v1->fresh(), ['payment_method' => 'especes'], $admin);
        $v1 = $v1->fresh();

        Sanctum::actingAs($admin);
        $v2 = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->assertCreated()->json('data');
        $v2Paid = $this->postJson("/api/pos-v2/invoices/{$v2['id']}/checkout", ['payment_method' => 'carte'])
            ->assertOk()
            ->json('data');

        $this->deleteJson("/api/transactions/{$v1->sale_id}")->assertOk();
        $this->deleteJson("/api/transactions/{$v2Paid['sale_id']}")->assertOk();

        $history = $this->getJson('/api/pos-v2/history')->assertOk();
        $rows = collect($history->json('data'))->keyBy('id');

        $this->assertTrue($rows[$v1->id]['sale_deleted']);
        $this->assertTrue($rows[$v2['id']]['sale_deleted']);
        $this->assertSame(0, $history->json('meta.page_paid_count'));
        $this->assertEquals(0, $history->json('meta.page_paid_total'));
        $this->assertSame(0, $history->json('meta.stats.paid_count'));
        $this->assertEquals(0, $history->json('meta.stats.paid_total'));
        $this->assertSame(0, $history->json('meta.stats.v1_count'));
        $this->assertSame(0, $history->json('meta.stats.v2_count'));
        $this->assertSame([], $history->json('meta.stats.employees'));
    }

    public function test_deleted_v1_and_v2_commissions_are_excluded_from_admin_commission_report_totals(): void
    {
        $admin = $this->superAdmin();
        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');
        $employee = Employee::factory()->create([
            'name' => 'Ahmed',
            'user_id' => $employeeUser->id,
            'default_commission_rate' => 50,
        ]);
        $service = Service::factory()->create(['name' => 'Coupe', 'price' => 100]);

        Sanctum::actingAs($admin);
        $activeV2 = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->assertCreated()->json('data');
        $this->postJson("/api/pos-v2/invoices/{$activeV2['id']}/checkout", ['payment_method' => 'carte'])
            ->assertOk();

        $deletedV2 = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->assertCreated()->json('data');
        $deletedV2Paid = $this->postJson("/api/pos-v2/invoices/{$deletedV2['id']}/checkout", ['payment_method' => 'carte'])
            ->assertOk()
            ->json('data');

        $prestations = app(PrestationService::class);
        $deletedV1 = $prestations->create(['items' => [['service_id' => $service->id]]], $employee, $employeeUser);
        $prestations->markServicesDone($deletedV1->fresh(), $employeeUser);
        $prestations->sendToCaisse($deletedV1->fresh(), $employeeUser, false);
        $prestations->confirmPayment($deletedV1->fresh(), ['payment_method' => 'especes'], $admin);
        $deletedV1 = $deletedV1->fresh();

        $this->deleteJson("/api/transactions/{$deletedV2Paid['sale_id']}")->assertOk();
        $this->deleteJson("/api/transactions/{$deletedV1->sale_id}")->assertOk();

        $report = $this->getJson('/api/reports/commissions?from='.now()->startOfMonth()->toDateString().'&to='.now()->toDateString())
            ->assertOk()
            ->json('data');

        $this->assertEquals(50, $report['total']);
        $this->assertSame(1, $report['by_employee'][0]['count']);
        $this->assertEquals(50, $report['by_employee'][0]['total']);

        $deletedDetails = collect($report['details'])->where('is_deleted', true);
        $this->assertCount(2, $deletedDetails);
        $this->assertTrue($deletedDetails->pluck('prestation_reference')->contains($deletedV1->reference));
        $this->assertTrue($deletedDetails->pluck('prestation_reference')->contains($deletedV2Paid['reference']));
    }

    public function test_dashboard_reports_day_totals_open_invoices_and_tips(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);

        $paidInvoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');
        $this->postJson("/api/pos-v2/invoices/{$paidInvoice['id']}/checkout", [
            'payment_method' => 'especes',
            'tips' => [['employee_id' => $employee->id, 'amount' => 15]],
        ])->assertOk();

        // One still open.
        $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->assertCreated();

        $dashboard = $this->getJson('/api/pos-v2/dashboard')->assertOk()->json('data');

        $this->assertEquals(100, $dashboard['revenue_total']);
        $this->assertSame(1, $dashboard['ticket_count']);
        $this->assertSame(1, $dashboard['v2_ticket_count']);
        $this->assertSame(1, $dashboard['open_invoices_count']);
        $this->assertEquals(100, $dashboard['open_invoices_total']);
        $this->assertEquals(15, $dashboard['tips_total']);
    }

    // ------------------------------------------------------------------
    // V1/V2 coexistence (§50)
    // ------------------------------------------------------------------

    public function test_v1_pending_queue_never_sees_v2_invoices(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);

        $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->assertCreated();

        $this->assertCount(0, $this->getJson('/api/prestations/pending')->assertOk()->json('data'));
    }

    public function test_v2_sales_appear_in_the_v1_day_ledger(): void
    {
        Sanctum::actingAs($this->superAdmin());
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);
        $workDay = WorkDay::query()->where('status', 'open')->first();

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
        ])->json('data');
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", ['payment_method' => 'carte'])->assertOk();

        $ledger = $this->getJson("/api/transactions?work_day_id={$workDay->id}")->assertOk()->json('data');
        $this->assertCount(1, $ledger);
        $this->assertEquals(100, $ledger[0]['total']);
    }
}
