<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\ClientSubscriptionUsage;
use App\Models\Employee;
use App\Models\Sale;
use App\Models\Service;
use App\Models\SubscriptionPayment;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\SubscriptionService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosV2SubscriptionTest extends TestCase
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

    protected function planFor(Service $service, float $price = 1200): SubscriptionPlan
    {
        $plan = SubscriptionPlan::create([
            'name' => 'Hammam Matin',
            'price' => $price,
            'duration_value' => 3,
            'duration_unit' => 'months',
            'is_active' => true,
        ]);

        $plan->services()->create([
            'service_id' => $service->id,
            'quota_period' => 'month',
            'quota_per_period' => 4,
            'quota_total' => 12,
            'allow_rollover' => false,
            'commission_basis' => 'public_price',
        ]);

        return $plan;
    }

    // ------------------------------------------------------------------
    // Visit consumed through a V2 invoice (§14-§15)
    // ------------------------------------------------------------------

    public function test_subscription_covered_line_is_free_and_confirms_the_visit_at_checkout(): void
    {
        $admin = $this->superAdmin();
        Sanctum::actingAs($admin);

        $employee = Employee::factory()->create(['default_commission_rate' => 20]);
        $client = Client::factory()->create();
        $hammam = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->planFor($hammam);
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);
        $planService = $plan->services()->first();

        $invoice = $this->postJson('/api/pos-v2/invoices', ['client_id' => $client->id])->json('data');

        $withLine = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/lines", [
            'service_id' => $hammam->id,
            'employee_id' => $employee->id,
            'client_subscription_id' => $subscription->id,
            'subscription_plan_service_id' => $planService->id,
        ])->assertCreated()->json('data');

        // §15 — covered: 0 to pay, public price preserved.
        $this->assertTrue($withLine['items'][0]['is_free']);
        $this->assertEquals(0, $withLine['items'][0]['unit_price']);
        $this->assertEquals(150, $withLine['items'][0]['public_price']);
        $this->assertEquals(0, $withLine['total']);

        $usage = ClientSubscriptionUsage::first();
        $this->assertSame(ClientSubscriptionUsage::STATUS_RESERVED, $usage->status);
        $this->assertSame($employee->id, $usage->employee_id);

        $paid = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ])->assertOk()->json('data');

        $this->assertSame(ClientSubscriptionUsage::STATUS_CONFIRMED, $usage->fresh()->status);
        // Commission on the public price (basis public_price at 20%).
        $this->assertEquals(30.0, (float) Sale::find($paid['sale_id'])->commission_amount);
        // Free visit = 0 MAD ticket.
        $this->assertEquals(0.0, (float) Sale::find($paid['sale_id'])->total);
    }

    public function test_cancelling_the_invoice_releases_the_reserved_visit(): void
    {
        $admin = $this->superAdmin();
        Sanctum::actingAs($admin);

        $employee = Employee::factory()->create();
        $client = Client::factory()->create();
        $hammam = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->planFor($hammam);
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);
        $planService = $plan->services()->first();

        $invoice = $this->postJson('/api/pos-v2/invoices', ['client_id' => $client->id])->json('data');
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/lines", [
            'service_id' => $hammam->id,
            'employee_id' => $employee->id,
            'client_subscription_id' => $subscription->id,
            'subscription_plan_service_id' => $planService->id,
        ])->assertCreated();

        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/cancel", ['reason' => 'Client parti'])->assertOk();

        $this->assertSame(ClientSubscriptionUsage::STATUS_VOIDED, ClientSubscriptionUsage::first()->status);
    }

    // ------------------------------------------------------------------
    // Partial payment at purchase + installments (§16-§17)
    // ------------------------------------------------------------------

    public function test_purchase_with_down_payment_tracks_the_remaining_balance(): void
    {
        $admin = $this->superAdmin();
        $client = Client::factory()->create();
        $hammam = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->planFor($hammam, 1200);

        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin, [
            'payment_method' => 'especes',
            'amount_paid' => 600,
        ]);

        $this->assertEquals(1200.0, (float) $subscription->total_amount);
        $this->assertEquals(600.0, (float) $subscription->sale->total);

        $status = app(SubscriptionService::class)->paymentStatus($subscription);
        $this->assertEquals(1200.0, $status['total']);
        $this->assertEquals(600.0, $status['paid']);
        $this->assertEquals(600.0, $status['remaining']);
    }

    public function test_installments_via_the_pos_endpoint_reduce_the_balance_and_create_sales(): void
    {
        $admin = $this->superAdmin();
        Sanctum::actingAs($admin);

        $client = Client::factory()->create();
        $hammam = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->planFor($hammam, 1200);
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin, ['amount_paid' => 600]);

        $after = $this->postJson("/api/pos-v2/subscriptions/{$subscription->id}/payments", [
            'amount' => 200,
            'payment_method' => 'especes',
        ])->assertCreated()->json('data');

        $this->assertEquals(800.0, $after['paid']);
        $this->assertEquals(400.0, $after['remaining']);
        $this->assertCount(1, $after['payments']);

        $payment = SubscriptionPayment::first();
        $this->assertNotNull($payment->sale_id);
        $sale = Sale::find($payment->sale_id);
        $this->assertEquals(200.0, (float) $sale->total);
        $this->assertSame('autre', $sale->category);
        // Booked on the open day so the closing report sees the money.
        $this->assertSame(WorkDay::where('status', 'open')->first()->id, $sale->work_day_id);

        // Overpay beyond the balance is rejected.
        $this->postJson("/api/pos-v2/subscriptions/{$subscription->id}/payments", [
            'amount' => 500,
            'payment_method' => 'especes',
        ])->assertStatus(422);
    }

    public function test_a_voided_installment_ticket_restores_the_balance(): void
    {
        $admin = $this->superAdmin();
        $client = Client::factory()->create();
        $hammam = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->planFor($hammam, 1000);
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin, ['amount_paid' => 400]);

        app(SubscriptionService::class)->recordPayment($subscription, 300, 'especes', $admin);
        $this->assertEquals(300.0, app(SubscriptionService::class)->paymentStatus($subscription->fresh())['remaining']);

        // The caisse voids the installment ticket -> the balance grows back.
        SubscriptionPayment::first()->sale->delete();
        $status = app(SubscriptionService::class)->paymentStatus($subscription->fresh());
        $this->assertEquals(600.0, $status['remaining']);
        $this->assertTrue($status['payments'][0]['voided']);
    }

    public function test_payment_on_a_cancelled_subscription_is_rejected(): void
    {
        $admin = $this->superAdmin();
        $client = Client::factory()->create();
        $hammam = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->planFor($hammam);
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin, ['amount_paid' => 500]);
        $subscription->update(['status' => ClientSubscription::STATUS_CANCELLED]);

        $this->expectException(ValidationException::class);
        app(SubscriptionService::class)->recordPayment($subscription->fresh(), 100, 'especes', $admin);
    }

    public function test_legacy_full_price_purchase_reports_a_zero_balance(): void
    {
        $admin = $this->superAdmin();
        $client = Client::factory()->create();
        $hammam = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->planFor($hammam, 1000);

        // V1 behaviour (no amount_paid): full price, no balance.
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);
        $status = app(SubscriptionService::class)->paymentStatus($subscription);

        $this->assertEquals(1000.0, $status['paid']);
        $this->assertEquals(0.0, $status['remaining']);

        // Pre-V2 rows (total_amount NULL) fall back to the snapshot price.
        $subscription->update(['total_amount' => null]);
        $fallback = app(SubscriptionService::class)->paymentStatus($subscription->fresh());
        $this->assertEquals(1000.0, $fallback['total']);
        $this->assertEquals(0.0, $fallback['remaining']);
    }

    // ------------------------------------------------------------------
    // Client context for the caisse (§14, §17, §18)
    // ------------------------------------------------------------------

    public function test_client_context_exposes_subscriptions_with_quotas_and_balance(): void
    {
        $admin = $this->superAdmin();
        Sanctum::actingAs($admin);

        $client = Client::factory()->create();
        $hammam = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->planFor($hammam, 1200);
        app(SubscriptionService::class)->purchase($client, $plan, $admin, ['amount_paid' => 700]);

        $context = $this->getJson("/api/pos-v2/clients/{$client->id}/context")->assertOk()->json('data');

        $this->assertSame($client->id, $context['client']['id']);
        $this->assertCount(1, $context['subscriptions']);
        $subscription = $context['subscriptions'][0];
        $this->assertSame('Hammam Matin', $subscription['plan_name']);
        $this->assertTrue($subscription['usable']);
        $this->assertEquals(700.0, $subscription['payment']['paid']);
        $this->assertEquals(500.0, $subscription['payment']['remaining']);
        $this->assertEquals(4, $subscription['services'][0]['period_remaining']);
        $this->assertEquals(12, $subscription['services'][0]['total_remaining']);
        $this->assertEquals(150.0, $subscription['services'][0]['public_price']);
    }
}
