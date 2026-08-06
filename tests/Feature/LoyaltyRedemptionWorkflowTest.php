<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\ClientSubscriptionUsage;
use App\Models\Employee;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyReward;
use App\Models\Service;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\PrestationService;
use App\Services\SubscriptionService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LoyaltyRedemptionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        WorkDay::factory()->create(['status' => 'open']);
    }

    /** @return array{0: Employee, 1: User} */
    protected function employeeWithLogin(): array
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create([
            'user_id' => $user->id,
            'default_commission_rate' => 40,
        ]);

        return [$employee, $user];
    }

    protected function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    protected function availableReward(Client $client, Service $service): LoyaltyReward
    {
        $program = LoyaltyProgram::create([
            'name' => '5 Hammams = 1 Gratuit',
            'type' => LoyaltyProgram::TYPE_SERVICE_COUNT,
            'is_active' => true,
            'config' => ['category' => 'hammam', 'threshold' => 5, 'reward' => ['type' => 'service', 'service_id' => $service->id]],
            'commission_basis' => 'public_price',
        ]);

        return LoyaltyReward::create([
            'client_id' => $client->id,
            'loyalty_program_id' => $program->id,
            'type' => 'service',
            'status' => LoyaltyReward::STATUS_AVAILABLE,
            'service_id' => $service->id,
            'commission_basis' => 'public_price',
            'generated_at' => now(),
            'expires_at' => now()->addDays(30),
        ]);
    }

    public function test_employee_can_redeem_a_reward_on_their_own_prestation_via_the_api(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $client = Client::factory()->create();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $reward = $this->availableReward($client, $service);

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id],
            $employee,
            $user,
        );

        // PrestationPolicy::update already requires ownership before anyone
        // can touch this cart at all — loyalty.redeem (granted to `employee`)
        // only ever lets someone attach a reward to a prestation they already
        // own, never someone else's.
        Sanctum::actingAs($user);
        $response = $this->postJson("/api/prestations/{$prestation->id}/items", [
            'service_id' => $service->id,
            'loyalty_reward_id' => $reward->id,
        ]);

        $response->assertCreated();
        $this->assertTrue((bool) $response->json('data.items.0.is_free'));
        $this->assertEquals(0, $response->json('data.items.0.unit_price'));
        $this->assertSame(LoyaltyReward::STATUS_RESERVED, $reward->fresh()->status);
    }

    public function test_employee_can_redeem_a_reward_as_the_very_first_item_of_a_new_prestation(): void
    {
        [, $user] = $this->employeeWithLogin();
        $client = Client::factory()->create();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $reward = $this->availableReward($client, $service);

        // Regression: the very first item of a brand new prestation goes
        // through PrestationController::store() (POST /api/prestations),
        // a different code path from storeItem() — it must accept the same
        // loyalty_reward_id field, not silently drop it and charge full price.
        Sanctum::actingAs($user);
        $response = $this->postJson('/api/prestations', [
            'client_id' => $client->id,
            'items' => [['service_id' => $service->id, 'loyalty_reward_id' => $reward->id]],
        ]);

        $response->assertCreated();
        $this->assertTrue((bool) $response->json('data.items.0.is_free'));
        $this->assertEquals(0, $response->json('data.items.0.unit_price'));
        $this->assertSame(LoyaltyReward::STATUS_RESERVED, $reward->fresh()->status);
    }

    public function test_employee_cannot_force_a_quota_exception_without_override_permission(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $client = Client::factory()->create();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);

        $plan = SubscriptionPlan::create(['name' => 'Hammam 3 mois', 'price' => 1000, 'duration_value' => 3, 'duration_unit' => 'months', 'is_active' => true]);
        $planService = $plan->services()->create(['service_id' => $service->id, 'quota_period' => 'week', 'quota_per_period' => 1]);
        $admin = $this->admin();
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);

        $prestation1 = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation1, $prestation1->items->first(), $user);

        $prestation2 = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );

        // Same week, quota already consumed — only loyalty.override_quota
        // (super-admin only) may force a second use, and only with a reason.
        Sanctum::actingAs($user);
        $response = $this->postJson("/api/prestations/{$prestation2->id}/items", [
            'service_id' => $service->id,
            'client_subscription_id' => $subscription->id,
            'subscription_plan_service_id' => $planService->id,
            'exception_override' => true,
            'override_reason' => 'Geste commercial',
        ]);

        $response->assertForbidden();
    }

    public function test_used_reward_cannot_be_reserved_a_second_time(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $client = Client::factory()->create();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $reward = $this->availableReward($client, $service);

        $prestationA = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $service->id, 'loyalty_reward_id' => $reward->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestationA, $user);
        app(PrestationService::class)->sendToCaisse($prestationA, $user);
        app(PrestationService::class)->confirmPayment($prestationA, ['payment_method' => 'especes'], $admin);

        $this->assertSame(LoyaltyReward::STATUS_USED, $reward->fresh()->status);

        $prestationB = app(PrestationService::class)->create(
            ['client_id' => $client->id],
            $employee,
            $user,
        );

        $this->expectException(ValidationException::class);
        app(PrestationService::class)->addItem(
            $prestationB,
            ['service_id' => $service->id, 'loyalty_reward_id' => $reward->id],
            $user,
        );
    }

    public function test_removing_an_item_releases_its_reward_reservation(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $client = Client::factory()->create();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $reward = $this->availableReward($client, $service);

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $service->id, 'loyalty_reward_id' => $reward->id]]],
            $employee,
            $user,
        );
        $this->assertSame(LoyaltyReward::STATUS_RESERVED, $reward->fresh()->status);

        $item = $prestation->items->first();
        app(PrestationService::class)->removeItem($prestation, $item);

        $this->assertSame(LoyaltyReward::STATUS_AVAILABLE, $reward->fresh()->status);
    }

    public function test_cancelling_a_prestation_releases_a_reserved_subscription_usage(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $client = Client::factory()->create();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);

        $plan = SubscriptionPlan::create(['name' => 'Hammam 3 mois', 'price' => 1000, 'duration_value' => 3, 'duration_unit' => 'months', 'is_active' => true]);
        $planService = $plan->services()->create(['service_id' => $service->id, 'quota_period' => 'week', 'quota_per_period' => 1]);
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        $item = $prestation->items->first();
        app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation, $item, $user);

        $usage = ClientSubscriptionUsage::where('client_subscription_id', $subscription->id)->firstOrFail();
        $this->assertSame(ClientSubscriptionUsage::STATUS_RESERVED, $usage->status);

        app(PrestationService::class)->cancel($prestation, 'Annulée', $user);

        $this->assertSame(ClientSubscriptionUsage::STATUS_VOIDED, $usage->fresh()->status);

        // The weekly slot is free again for a new prestation.
        $prestation2 = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation2, $prestation2->items->first(), $user);
        $this->assertEquals(0, $prestation2->items->first()->fresh()->unit_price);
    }

    public function test_employee_can_read_a_clients_loyalty_status_via_the_api(): void
    {
        [, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $client = Client::factory()->create();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $reward = $this->availableReward($client, $service);

        $plan = SubscriptionPlan::create(['name' => 'Hammam 3 mois', 'price' => 1000, 'duration_value' => 3, 'duration_unit' => 'months', 'is_active' => true]);
        $planService = $plan->services()->create(['service_id' => $service->id, 'quota_period' => 'week', 'quota_per_period' => 1]);
        app(SubscriptionService::class)->purchase($client, $plan, $admin);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/clients/{$client->id}/loyalty-status");

        $response->assertOk();
        $response->assertJsonPath('data.rewards.0.id', $reward->id);
        $response->assertJsonPath('data.rewards.0.service_id', $service->id);
        $response->assertJsonPath('data.subscriptions.0.services.0.subscription_plan_service_id', $planService->id);
        $response->assertJsonPath('data.subscriptions.0.services.0.period_remaining', 1);
        $response->assertJsonPath('data.subscriptions.0.services.0.total_remaining', null);
    }

    public function test_refunding_a_subscription_redemption_restores_the_quota(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $superAdmin = User::factory()->create(['role' => 'super-admin']);
        $superAdmin->assignRole('super-admin');
        $client = Client::factory()->create();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);

        $plan = SubscriptionPlan::create(['name' => 'Hammam 3 mois', 'price' => 1000, 'duration_value' => 3, 'duration_unit' => 'months', 'is_active' => true]);
        $planService = $plan->services()->create(['service_id' => $service->id, 'quota_period' => 'week', 'quota_per_period' => 1]);
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation, $prestation->items->first(), $user);
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        $usage = ClientSubscriptionUsage::where('client_subscription_id', $subscription->id)->firstOrFail();
        $this->assertSame(ClientSubscriptionUsage::STATUS_CONFIRMED, $usage->status);

        app(PrestationService::class)->refund($paid, 'Client insatisfait', $superAdmin);

        $this->assertSame(ClientSubscriptionUsage::STATUS_VOIDED, $usage->fresh()->status);

        // Quota is free again — a new redemption the same week succeeds.
        $prestation2 = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation2, $prestation2->items->first(), $user);
        $this->assertEquals(0, $prestation2->items->first()->fresh()->unit_price);
    }
}
