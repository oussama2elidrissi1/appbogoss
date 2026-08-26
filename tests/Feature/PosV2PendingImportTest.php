<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientSubscriptionUsage;
use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\Sale;
use App\Models\Service;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\PrestationService;
use App\Services\SubscriptionService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Bridge: prestations sent to the caisse by employees (V1 Mon Espace
 * workflow) surface in Caisse V2 and can be adopted as a V2 invoice or
 * merged into a client's open invoice — leaving the V1 queue atomically.
 */
class PosV2PendingImportTest extends TestCase
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

    /** Employee-sent prestation, exactly as Mon Espace produces it. */
    protected function sendPrestationFromEmployee(Employee $employee, User $employeeUser, array $items, ?int $clientId = null): Prestation
    {
        $service = app(PrestationService::class);
        $prestation = $service->create(
            ['client_id' => $clientId, 'items' => $items],
            $employee,
            $employeeUser,
        );
        $service->markServicesDone($prestation->fresh(), $employeeUser);

        return $service->sendToCaisse($prestation->fresh(), $employeeUser, false)->fresh();
    }

    /** @return array{0: Employee, 1: User} */
    protected function employeeWithLogin(string $name = 'Omar', float $rate = 20): array
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create([
            'user_id' => $user->id,
            'name' => $name,
            'default_commission_rate' => $rate,
        ]);

        return [$employee, $user];
    }

    public function test_employee_sent_prestations_appear_in_the_v2_pending_list(): void
    {
        [$omar, $omarUser] = $this->employeeWithLogin();
        $coupe = Service::factory()->create(['name' => 'Coupe cheveux + barbe', 'price' => 70]);
        $sent = $this->sendPrestationFromEmployee($omar, $omarUser, [['service_id' => $coupe->id]]);

        Sanctum::actingAs($this->superAdmin());

        // A V2 invoice must never show up in this bridge list.
        $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $coupe->id, 'employee_id' => $omar->id]],
        ])->assertCreated();

        $pending = $this->getJson('/api/pos-v2/pending')->assertOk()->json('data');

        $this->assertCount(1, $pending);
        $this->assertSame($sent->id, $pending[0]['id']);
        $this->assertSame('Omar', $pending[0]['employee_name']);
        $this->assertEquals(70, $pending[0]['total']);
        $this->assertSame('Coupe cheveux + barbe', $pending[0]['services_label']);
    }

    public function test_adopting_a_pending_prestation_turns_it_into_a_v2_invoice_and_empties_both_queues(): void
    {
        [$omar, $omarUser] = $this->employeeWithLogin('Omar', 50);
        $coupe = Service::factory()->create(['name' => 'Coupe', 'price' => 70]);
        $sent = $this->sendPrestationFromEmployee($omar, $omarUser, [['service_id' => $coupe->id]]);

        Sanctum::actingAs($this->superAdmin());

        $invoice = $this->postJson("/api/pos-v2/pending/{$sent->id}/import")->assertOk()->json('data');

        // Same row, now a V2 open invoice with the performer on each line.
        $this->assertSame($sent->id, $invoice['id']);
        $this->assertSame('in_progress', $invoice['status']);
        $this->assertSame('caisse_v2', $invoice['channel']);
        $this->assertSame($omar->id, $invoice['items'][0]['employee_id']);

        // Gone from BOTH queues — no double charge possible.
        $this->assertCount(0, $this->getJson('/api/pos-v2/pending')->json('data'));
        $this->assertCount(0, $this->getJson('/api/prestations/pending')->json('data'));

        // And it checks out like any V2 invoice, commission to the performer.
        $paid = $this->postJson("/api/pos-v2/invoices/{$sent->id}/checkout", [
            'payment_method' => 'especes',
        ])->assertOk()->json('data');
        $this->assertEquals(70.0, (float) Sale::find($paid['sale_id'])->total);
        $this->assertEquals(35.0, (float) Commission::where('prestation_id', $sent->id)->where('employee_id', $omar->id)->sum('amount'));
    }

    public function test_merging_moves_the_lines_into_the_clients_invoice_and_cancels_the_source(): void
    {
        $client = Client::factory()->create(['name' => 'Ahmed']);
        [$omar, $omarUser] = $this->employeeWithLogin('Omar', 50);
        $kamal = Employee::factory()->create(['name' => 'Kamal', 'default_commission_rate' => 20]);
        $coupe = Service::factory()->create(['name' => 'Coupe', 'price' => 70]);
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);

        $sent = $this->sendPrestationFromEmployee($omar, $omarUser, [['service_id' => $coupe->id]], $client->id);

        Sanctum::actingAs($this->superAdmin());
        $target = $this->postJson('/api/pos-v2/invoices', [
            'client_id' => $client->id,
            'items' => [['service_id' => $hammam->id, 'employee_id' => $kamal->id]],
        ])->assertCreated()->json('data');

        $merged = $this->postJson("/api/pos-v2/pending/{$sent->id}/import", [
            'target_invoice_id' => $target['id'],
        ])->assertOk()->json('data');

        // Both lines on the client's invoice, each with ITS employee.
        $this->assertSame($target['id'], $merged['id']);
        $this->assertCount(2, $merged['items']);
        $this->assertEquals(220, $merged['total']);
        $byLabel = collect($merged['items'])->keyBy('label');
        $this->assertSame($kamal->id, $byLabel['Hammam Turc']['employee_id']);
        $this->assertSame($omar->id, $byLabel['Coupe']['employee_id']);

        // The source is closed with an explicit trace — V1 queue empty.
        $source = Prestation::find($sent->id);
        $this->assertSame(Prestation::STATUS_CANCELLED, $source->status);
        $this->assertStringContainsString($merged['reference'], $source->cancel_reason);
        $this->assertCount(0, $this->getJson('/api/prestations/pending')->json('data'));

        // Checkout pays 220 and splits the commissions per performer.
        $paid = $this->postJson("/api/pos-v2/invoices/{$merged['id']}/checkout", [
            'payment_method' => 'carte',
        ])->assertOk()->json('data');
        $commissions = Commission::where('prestation_id', $merged['id'])->get();
        $this->assertEquals(30.0, (float) $commissions->firstWhere('employee_id', $kamal->id)->amount); // 150 × 20%
        $this->assertEquals(35.0, (float) $commissions->firstWhere('employee_id', $omar->id)->amount);  // 70 × 50%
        $this->assertEquals(220.0, (float) Sale::find($paid['sale_id'])->total);
    }

    public function test_merging_into_another_clients_invoice_is_refused(): void
    {
        $ahmed = Client::factory()->create();
        $youssef = Client::factory()->create();
        [$omar, $omarUser] = $this->employeeWithLogin();
        $kamal = Employee::factory()->create(['name' => 'Kamal']);
        $coupe = Service::factory()->create(['price' => 70]);

        $sent = $this->sendPrestationFromEmployee($omar, $omarUser, [['service_id' => $coupe->id]], $ahmed->id);

        Sanctum::actingAs($this->superAdmin());
        $target = $this->postJson('/api/pos-v2/invoices', [
            'client_id' => $youssef->id,
            'items' => [['service_id' => $coupe->id, 'employee_id' => $kamal->id]],
        ])->json('data');

        $this->postJson("/api/pos-v2/pending/{$sent->id}/import", [
            'target_invoice_id' => $target['id'],
        ])->assertStatus(422);

        // Nothing moved, the prestation is still pending in both worlds.
        $this->assertSame(Prestation::STATUS_PENDING_PAYMENT, Prestation::find($sent->id)->status);
        $this->assertCount(1, $this->getJson('/api/pos-v2/pending')->json('data'));
    }

    public function test_merging_transfers_a_reserved_subscription_visit_to_the_target(): void
    {
        $client = Client::factory()->create();
        [$omar, $omarUser] = $this->employeeWithLogin('Omar', 20);
        $hammam = Service::factory()->create(['name' => 'Hammam', 'category' => 'hammam', 'price' => 150]);
        $plan = SubscriptionPlan::create([
            'name' => 'Hammam 3 mois', 'price' => 1000,
            'duration_value' => 3, 'duration_unit' => 'months', 'is_active' => true,
        ]);
        $plan->services()->create([
            'service_id' => $hammam->id,
            'quota_period' => 'month', 'quota_per_period' => 4, 'quota_total' => 12,
            'allow_rollover' => false, 'commission_basis' => 'public_price',
        ]);
        $admin = $this->superAdmin();
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);

        // Employee redeems the visit from Mon Espace, then sends to caisse.
        $sent = $this->sendPrestationFromEmployee($omar, $omarUser, [[
            'service_id' => $hammam->id,
            'client_subscription_id' => $subscription->id,
            'subscription_plan_service_id' => $plan->services()->first()->id,
        ]], $client->id);
        $usage = ClientSubscriptionUsage::first();
        $this->assertSame($sent->id, $usage->reserved_prestation_id);

        Sanctum::actingAs($admin);
        $target = $this->postJson('/api/pos-v2/invoices', ['client_id' => $client->id])->json('data');
        $merged = $this->postJson("/api/pos-v2/pending/{$sent->id}/import", [
            'target_invoice_id' => $target['id'],
        ])->assertOk()->json('data');

        // The reservation follows the lines onto the receiving invoice…
        $this->assertSame($merged['id'], $usage->fresh()->reserved_prestation_id);
        $this->assertTrue($merged['items'][0]['is_free']);

        // …and checkout confirms the visit there.
        $this->postJson("/api/pos-v2/invoices/{$merged['id']}/checkout", ['payment_method' => 'especes'])->assertOk();
        $this->assertSame(ClientSubscriptionUsage::STATUS_CONFIRMED, $usage->fresh()->status);
    }

    public function test_only_pending_prestations_can_be_imported(): void
    {
        [$omar, $omarUser] = $this->employeeWithLogin();
        $coupe = Service::factory()->create(['price' => 70]);
        $prestation = app(PrestationService::class)->create(
            ['items' => [['service_id' => $coupe->id]]],
            $omar,
            $omarUser,
        );

        Sanctum::actingAs($this->superAdmin());

        // Still in_progress on the employee side — not sent to the caisse yet.
        $this->postJson("/api/pos-v2/pending/{$prestation->id}/import")->assertStatus(422);
    }
}
