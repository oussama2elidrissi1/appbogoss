<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\Sale;
use App\Models\Service;
use App\Models\Tip;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * §1-§14 (itération 2) — UNE LIGNE = UN SERVICE = UN EMPLOYÉ RESPONSABLE.
 * The skills relation is the existing employees.service_categories +
 * employees.allowed_service_ids pair (empty = no restriction).
 */
class PosV2EmployeeEligibilityTest extends TestCase
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

    /** Omar: coiffure only. Yassine: hammam only. Hamza: no restriction. */
    private function team(): array
    {
        $omar = Employee::factory()->create([
            'name' => 'Omar',
            'service_categories' => ['coiffure'],
            'default_commission_rate' => 20,
        ]);
        $yassine = Employee::factory()->create([
            'name' => 'Yassine',
            'service_categories' => ['hammam'],
            'default_commission_rate' => 20,
        ]);
        $hamza = Employee::factory()->create([
            'name' => 'Hamza',
            'default_commission_rate' => 20,
        ]);

        return [$omar, $yassine, $hamza];
    }

    // ------------------------------------------------------------------
    // §11 — single eligible employee: auto-assigned
    // ------------------------------------------------------------------

    public function test_service_with_a_single_eligible_employee_is_auto_assigned(): void
    {
        $ibrahim = Employee::factory()->create(['name' => 'Ibrahim']);
        Employee::factory()->create([
            'name' => 'Omar',
            'service_categories' => ['coiffure'],
        ]);
        $hijama = Service::factory()->create(['name' => 'Hijama', 'category' => 'massage', 'price' => 200]);
        // Only Ibrahim can perform massage-category services here.
        $ibrahim->update(['service_categories' => ['massage']]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $hijama->id]],
        ])->assertCreated()->json('data');

        $this->assertSame($ibrahim->id, $invoice['items'][0]['employee_id']);
        $this->assertSame('Ibrahim', $invoice['items'][0]['employee_name']);
    }

    public function test_service_with_multiple_eligible_employees_stays_unassigned_without_a_choice(): void
    {
        $this->team();
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);
        // Yassine (hammam) + Hamza (unrestricted) are both eligible.

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $hammam->id]],
        ])->assertCreated()->json('data');

        $this->assertNull($invoice['items'][0]['employee_id']);
        $this->assertTrue($invoice['items'][0]['requires_employee']);
    }

    // ------------------------------------------------------------------
    // §2 + §14 — authorisation enforced server-side
    // ------------------------------------------------------------------

    public function test_unauthorised_employee_is_refused_when_adding_a_line(): void
    {
        [$omar] = $this->team();
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);

        $response = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $hammam->id, 'employee_id' => $omar->id]],
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('ne réalise pas', $response->json('message'));
    }

    public function test_allowed_service_ids_restriction_is_enforced_on_line_update(): void
    {
        $coupe = Service::factory()->create(['name' => 'Coupe', 'category' => 'coiffure', 'price' => 40]);
        $barbe = Service::factory()->create(['name' => 'Barbe', 'category' => 'coiffure', 'price' => 30]);
        $specialist = Employee::factory()->create([
            'name' => 'Spécialiste barbe',
            'allowed_service_ids' => [$barbe->id],
        ]);
        $generalist = Employee::factory()->create(['name' => 'Généraliste']);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $coupe->id, 'employee_id' => $generalist->id]],
        ])->assertCreated()->json('data');

        // The barbe specialist cannot take over the coupe line…
        $this->patchJson("/api/pos-v2/invoices/{$invoice['id']}/lines/{$invoice['items'][0]['id']}", [
            'employee_id' => $specialist->id,
        ])->assertStatus(422);

        // …but can take a barbe line.
        $withBarbe = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/lines", [
            'service_id' => $barbe->id,
            'employee_id' => $specialist->id,
        ])->assertCreated()->json('data');
        $this->assertSame($specialist->id, $withBarbe['items'][1]['employee_id']);
    }

    // ------------------------------------------------------------------
    // §1 — checkout blocked without a responsible employee
    // ------------------------------------------------------------------

    public function test_checkout_is_blocked_when_a_human_service_line_has_no_employee(): void
    {
        $this->team();
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $hammam->id]],
        ])->json('data');

        $response = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('Employé manquant', $response->json('message'));
        $this->assertStringContainsString('Hammam Turc', $response->json('message'));
        $this->assertSame(0, Sale::count());
    }

    public function test_checkout_revalidates_authorisation_even_for_an_already_assigned_line(): void
    {
        [, $yassine] = $this->team();
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $hammam->id, 'employee_id' => $yassine->id]],
        ])->assertCreated()->json('data');

        // The skills change between line creation and checkout.
        $yassine->update(['service_categories' => ['massage']]);

        $response = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('ne réalise pas', $response->json('message'));
        $this->assertSame(0, Sale::count());
    }

    public function test_checkout_refuses_an_employee_deactivated_since_the_line_was_added(): void
    {
        [, $yassine] = $this->team();
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $hammam->id, 'employee_id' => $yassine->id]],
        ])->json('data');

        $yassine->update(['is_active' => false]);

        $response = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('actif', $response->json('message'));
    }

    // ------------------------------------------------------------------
    // §13 — lines that genuinely need no employee
    // ------------------------------------------------------------------

    public function test_free_text_line_and_no_employee_service_check_out_without_an_employee(): void
    {
        Employee::factory()->create(['name' => 'Omar']);
        $fraisService = Service::factory()->create([
            'name' => 'Frais vestiaire',
            'category' => 'autre',
            'price' => 10,
            'requires_employee' => false,
        ]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [
                ['service_id' => $fraisService->id],
                ['label' => 'Bouteille d’eau', 'unit_price' => 8],
            ],
        ])->assertCreated()->json('data');

        $this->assertFalse($invoice['items'][0]['requires_employee']);
        $this->assertFalse($invoice['items'][1]['requires_employee']);

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ])->assertOk()->json('data');

        $this->assertEquals(18, $paid['total']);
        // No employee -> no commission rows at all.
        $this->assertSame(0, Commission::count());
    }

    // ------------------------------------------------------------------
    // §7 + §18 — 3 services, 3 restricted employees, 3 correct commissions
    // ------------------------------------------------------------------

    public function test_three_restricted_employees_each_earn_their_own_commission(): void
    {
        $coupe = Service::factory()->create(['name' => 'Coupe simple', 'category' => 'coiffure', 'price' => 40]);
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);
        $massage = Service::factory()->create(['name' => 'Massage sportif', 'category' => 'massage', 'price' => 250]);

        $omar = Employee::factory()->create(['name' => 'Omar', 'service_categories' => ['coiffure'], 'default_commission_rate' => 50]);
        $hamza = Employee::factory()->create(['name' => 'Hamza', 'service_categories' => ['hammam'], 'default_commission_rate' => 20]);
        $nour = Employee::factory()->create(['name' => 'Nourredine', 'service_categories' => ['massage'], 'default_commission_rate' => 20]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [
                ['service_id' => $coupe->id, 'employee_id' => $omar->id],
                ['service_id' => $hammam->id, 'employee_id' => $hamza->id],
                ['service_id' => $massage->id, 'employee_id' => $nour->id],
            ],
        ])->assertCreated()->json('data');

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'carte',
        ])->assertOk()->json('data');

        $this->assertEquals(440, $paid['total']);

        $commissions = Commission::where('prestation_id', $invoice['id'])->get();
        $this->assertCount(3, $commissions);
        $this->assertEquals(20.0, (float) $commissions->firstWhere('employee_id', $omar->id)->amount);   // 40 × 50%
        $this->assertEquals(30.0, (float) $commissions->firstWhere('employee_id', $hamza->id)->amount);  // 150 × 20%
        $this->assertEquals(50.0, (float) $commissions->firstWhere('employee_id', $nour->id)->amount);   // 250 × 20%
        $this->assertEquals(100.0, (float) Sale::find($paid['sale_id'])->commission_amount);
    }

    // ------------------------------------------------------------------
    // §8 — line tip follows the line's employee
    // ------------------------------------------------------------------

    public function test_line_tip_defaults_to_and_enforces_the_line_employee(): void
    {
        [$omar, $yassine] = $this->team();
        $coupe = Service::factory()->create(['name' => 'Coupe', 'category' => 'coiffure', 'price' => 40]);
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [
                ['service_id' => $coupe->id, 'employee_id' => $omar->id],
                ['service_id' => $hammam->id, 'employee_id' => $yassine->id],
            ],
        ])->json('data');
        $hammamLineId = $invoice['items'][1]['id'];

        // A line tip claiming another employee is refused, nothing written.
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
            'tips' => [
                ['prestation_item_id' => $hammamLineId, 'employee_id' => $omar->id, 'amount' => 20],
            ],
        ])->assertStatus(422);
        $this->assertSame(0, Sale::count());

        // Without employee_id, the beneficiary is derived from the line.
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
            'tips' => [
                ['prestation_item_id' => $hammamLineId, 'amount' => 20],
            ],
        ])->assertOk();

        $tip = Tip::first();
        $this->assertSame($yassine->id, $tip->employee_id);
        $this->assertSame($hammamLineId, $tip->prestation_item_id);
    }
}
