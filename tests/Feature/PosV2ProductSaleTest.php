<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\Product;
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
 * Vente de produits (vitrine / réfrigérateur) en Caisse V2 : stock verrouillé
 * et décrémenté à l'encaissement, restauré au remboursement, aucune
 * commission, attribution du ticket au pseudo-employé société comme en V1.
 */
class PosV2ProductSaleTest extends TestCase
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

    /** Already seeded by the 2026_07_30_140000 migration (company_area is unique). */
    protected function companyEmployee(string $area): Employee
    {
        return Employee::where('is_company', true)->where('company_area', $area)->firstOrFail();
    }

    public function test_product_line_sells_with_stock_decrement_and_company_attribution(): void
    {
        $fridge = $this->companyEmployee('refrigerateur');
        $coca = Product::factory()->create([
            'name' => 'Coca-Cola',
            'stock_area' => 'refrigerateur',
            'price' => 10,
            'stock_quantity' => 5,
        ]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['product_id' => $coca->id, 'quantity' => 2]],
        ])->assertCreated()->json('data');

        // Label + prix du produit, pas d'employé requis.
        $this->assertSame('Coca-Cola', $invoice['items'][0]['label']);
        $this->assertEquals(10, $invoice['items'][0]['unit_price']);
        $this->assertSame($coca->id, $invoice['items'][0]['product_id']);
        $this->assertFalse($invoice['items'][0]['requires_employee']);
        $this->assertSame('boisson', $invoice['items'][0]['category']);
        $this->assertEquals(20, $invoice['total']);

        // Le stock ne bouge PAS tant que la facture est ouverte.
        $this->assertSame(5, $coca->fresh()->stock_quantity);

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ])->assertOk()->json('data');

        // Stock décrémenté de la quantité, à l'encaissement seulement.
        $this->assertSame(3, $coca->fresh()->stock_quantity);

        $sale = Sale::find($paid['sale_id']);
        $this->assertEquals(20.0, (float) $sale->total);
        $this->assertSame('boisson', $sale->category);
        // Attribution au pseudo-employé société (comme la vente rapide V1)…
        $this->assertSame($fridge->id, $sale->employee_id);
        // …itemable Product (le void V1 restaure le stock par ce lien)…
        $this->assertSame(Product::class, SaleItem::first()->itemable_type);
        // …et zéro commission.
        $this->assertSame(0, Commission::count());

        $history = $this->getJson('/api/pos-v2/history?work_day_id='.WorkDay::firstOrFail()->id)
            ->assertOk();
        $this->assertSame(2, $history->json('meta.stats.sales_count'));
        $this->assertEquals(20, $history->json('meta.stats.sales_total'));
        $this->assertSame('refrigerateur', $history->json('meta.stats.sales_by_area.1.area'));
        $this->assertSame(2, $history->json('meta.stats.sales_by_area.1.count'));
        $this->assertEquals(20, $history->json('meta.stats.sales_by_area.1.total'));
    }

    public function test_insufficient_stock_blocks_the_checkout_atomically(): void
    {
        $this->companyEmployee('vitrine');
        $shampoing = Product::factory()->create([
            'name' => 'Shampoing',
            'stock_area' => 'vitrine',
            'price' => 80,
            'stock_quantity' => 1,
        ]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['product_id' => $shampoing->id]],
        ])->assertCreated()->json('data');

        // Le stock part ailleurs pendant que la facture est ouverte.
        $shampoing->update(['stock_quantity' => 0]);

        $response = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'carte',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('Stock insuffisant', $response->json('message'));
        $this->assertSame(0, Sale::count());
        $this->assertSame(0, $shampoing->fresh()->stock_quantity);
    }

    public function test_refund_restores_the_stock(): void
    {
        $this->companyEmployee('vitrine');
        $produit = Product::factory()->create([
            'stock_area' => 'vitrine',
            'price' => 50,
            'stock_quantity' => 4,
        ]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['product_id' => $produit->id, 'quantity' => 2]],
        ])->json('data');
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", ['payment_method' => 'especes'])->assertOk();
        $this->assertSame(2, $produit->fresh()->stock_quantity);

        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/refund", ['reason' => 'Erreur'])->assertOk();

        $this->assertSame(4, $produit->fresh()->stock_quantity);
    }

    public function test_mixed_invoice_service_plus_product_splits_correctly(): void
    {
        $kamal = Employee::factory()->create(['name' => 'Kamal', 'default_commission_rate' => 20]);
        $hammam = Service::factory()->create(['name' => 'Hammam', 'category' => 'hammam', 'price' => 150]);
        $coca = Product::factory()->create(['stock_area' => 'refrigerateur', 'price' => 10, 'stock_quantity' => 3]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [
                ['service_id' => $hammam->id, 'employee_id' => $kamal->id],
                ['product_id' => $coca->id],
            ],
        ])->assertCreated()->json('data');

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ])->assertOk()->json('data');

        $sale = Sale::find($paid['sale_id']);
        $this->assertEquals(160.0, (float) $sale->total);
        // Catégories mixtes -> 'autre' ; ticket attribué à l'employé humain.
        $this->assertSame('autre', $sale->category);
        $this->assertSame($kamal->id, $sale->employee_id);
        // Une seule commission : celle du service, jamais du produit.
        $this->assertSame(1, Commission::count());
        $this->assertEquals(30.0, (float) Commission::first()->amount);
        $this->assertSame(2, $coca->fresh()->stock_quantity);
    }

    public function test_product_lines_reject_employees_and_redemptions(): void
    {
        $kamal = Employee::factory()->create(['name' => 'Kamal']);
        $coca = Product::factory()->create(['stock_area' => 'refrigerateur', 'price' => 10, 'stock_quantity' => 3]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['product_id' => $coca->id]],
        ])->assertCreated()->json('data');

        // Pas d'employé responsable sur une ligne produit.
        $this->patchJson("/api/pos-v2/invoices/{$invoice['id']}/lines/{$invoice['items'][0]['id']}", [
            'employee_id' => $kamal->id,
        ])->assertStatus(422);

        // Ajout d'un produit sur une facture existante (endpoint /lines) :
        // aucun libellé requis — il vient du produit (régression du bug
        // « The label field is required when service id is not present »).
        $gel = Product::factory()->create(['name' => 'Gel', 'stock_area' => 'vitrine', 'price' => 30, 'stock_quantity' => 5]);
        $withGel = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/lines", [
            'product_id' => $gel->id,
        ])->assertCreated()->json('data');
        $this->assertSame('Gel', $withGel['items'][1]['label']);

        // Rupture à l'ajout : refus immédiat, avec le bon message.
        $vide = Product::factory()->create(['stock_area' => 'vitrine', 'price' => 30, 'stock_quantity' => 0]);
        $response = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/lines", [
            'product_id' => $vide->id,
        ]);
        $response->assertStatus(422);
        $this->assertStringContainsString('Stock insuffisant', $response->json('message'));
    }
}
