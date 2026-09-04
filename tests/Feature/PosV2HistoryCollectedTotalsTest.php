<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Sale;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Les totaux « encaissé » de l'historique caisse.
 *
 * Chaque ligne de l'historique affiche le total encaissé pourboire compris ;
 * les compteurs de l'entête (CA encaissé, CA par employé, total de page)
 * l'ignoraient — la somme des lignes ne retombait jamais sur l'entête (écart
 * observé : lignes 3 000, CA encaissé 2 980, le pourboire de 20 disparu).
 *
 * Depuis `pos.collected_totals_from`, les compteurs comptent les pourboires
 * eux aussi. Les journées antérieures à cette date gardent leurs anciens
 * chiffres : elles ont été lues et clôturées ainsi. Et dans tous les cas, le
 * CA du salon (Sale.total) reste hors pourboires — §40 ne bouge pas.
 */
class PosV2HistoryCollectedTotalsTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-09-10 10:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->travelTo(self::NOW);
        WorkDay::factory()->create(['status' => 'open', 'date' => '2026-09-10']);
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create(['role' => 'super-admin']);
        $user->assignRole('super-admin');

        return $user;
    }

    /**
     * Une facture payée avec pourboire : 250 (Yassine) + 70 (Omar) de
     * services, 20 de pourboire pour Omar — 340 encaissés au total.
     *
     * @return array<string, mixed>
     */
    private function paidInvoiceWithTip(Employee $yassine, Employee $omar): array
    {
        $hammam = Service::factory()->create(['name' => 'Hammam royale', 'category' => 'hammam', 'price' => 250]);
        $coupe = Service::factory()->create(['name' => 'Coupe cheveux + barbe', 'category' => 'coiffure', 'price' => 70]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [
                ['service_id' => $hammam->id, 'employee_id' => $yassine->id],
                ['service_id' => $coupe->id, 'employee_id' => $omar->id],
            ],
        ])->assertCreated()->json('data');

        return $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
            'tips' => [['employee_id' => $omar->id, 'amount' => 20]],
        ])->assertOk()->json('data');
    }

    public function test_tips_count_in_history_totals_from_the_cutoff_date(): void
    {
        config(['pos.collected_totals_from' => '2026-09-04']);
        Sanctum::actingAs($this->superAdmin());
        $yassine = Employee::factory()->create(['name' => 'Yassine']);
        $omar = Employee::factory()->create(['name' => 'Omar', 'default_commission_rate' => 50]);

        $paid = $this->paidInvoiceWithTip($yassine, $omar);

        // La ligne affiche 340 — l'entête et le pied de page doivent dire pareil.
        $this->assertEquals(340, $paid['total_collected']);

        $history = $this->getJson('/api/pos-v2/history')->assertOk();
        $this->assertEquals(340, $history->json('meta.stats.paid_total'));
        $this->assertEquals(340, $history->json('meta.page_paid_total'));

        // Le pourboire suit son bénéficiaire dans « CA par employé ».
        $employees = collect($history->json('meta.stats.employees'))->keyBy('employee_name');
        $this->assertEquals(250, $employees['Yassine']['total']);
        $this->assertEquals(90, $employees['Omar']['total']);

        // §40 intact : le CA du salon ne bouge pas d'un centime.
        $this->assertEquals(320.0, (float) Sale::findOrFail($paid['sale_id'])->total);
    }

    public function test_days_before_the_cutoff_keep_their_old_totals(): void
    {
        // La bascule est au lendemain : la facture d'aujourd'hui est un
        // « ancien jour » et doit garder les chiffres d'avant, sans pourboire.
        config(['pos.collected_totals_from' => '2026-09-11']);
        Sanctum::actingAs($this->superAdmin());
        $yassine = Employee::factory()->create(['name' => 'Yassine']);
        $omar = Employee::factory()->create(['name' => 'Omar', 'default_commission_rate' => 50]);

        $paid = $this->paidInvoiceWithTip($yassine, $omar);

        // La ligne, elle, a toujours affiché le total pourboire compris.
        $this->assertEquals(340, $paid['total_collected']);

        $history = $this->getJson('/api/pos-v2/history')->assertOk();
        $this->assertEquals(320, $history->json('meta.stats.paid_total'));
        $this->assertEquals(320, $history->json('meta.page_paid_total'));

        $employees = collect($history->json('meta.stats.employees'))->keyBy('employee_name');
        $this->assertEquals(250, $employees['Yassine']['total']);
        $this->assertEquals(70, $employees['Omar']['total']);
    }

    public function test_an_invoice_without_tip_is_unchanged_by_the_cutoff(): void
    {
        config(['pos.collected_totals_from' => '2026-09-04']);
        Sanctum::actingAs($this->superAdmin());
        $omar = Employee::factory()->create(['name' => 'Omar']);
        $service = Service::factory()->create(['price' => 150]);

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $omar->id]],
        ])->assertCreated()->json('data');
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'carte',
        ])->assertOk();

        $history = $this->getJson('/api/pos-v2/history')->assertOk();
        $this->assertEquals(150, $history->json('meta.stats.paid_total'));
        $this->assertEquals(150, $history->json('meta.page_paid_total'));
        $this->assertEquals(150, $history->json('meta.stats.employees.0.total'));
    }
}
