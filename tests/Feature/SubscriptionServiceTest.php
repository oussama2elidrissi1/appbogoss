<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\ClientSubscriptionUsage;
use App\Models\Employee;
use App\Models\Service;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\PrestationService;
use App\Services\SubscriptionService;
use Carbon\Carbon;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class SubscriptionServiceTest extends TestCase
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
        $employee = Employee::factory()->create(['user_id' => $user->id]);

        return [$employee, $user];
    }

    protected function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    protected function hammamPlanWithWeeklyQuota(Service $hammamService): SubscriptionPlan
    {
        $plan = SubscriptionPlan::create([
            'name' => 'Hammam 3 mois',
            'price' => 1000,
            'duration_value' => 3,
            'duration_unit' => 'months',
            'is_active' => true,
        ]);

        $plan->services()->create([
            'service_id' => $hammamService->id,
            'quota_period' => 'week',
            'quota_per_period' => 1,
            'quota_total' => null,
            'allow_rollover' => false,
            'commission_basis' => 'public_price',
        ]);

        return $plan;
    }

    public function test_purchase_creates_active_subscription_with_sale(): void
    {
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->hammamPlanWithWeeklyQuota($hammamService);
        $admin = $this->admin();

        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin, ['payment_method' => 'carte']);

        $this->assertSame(ClientSubscription::STATUS_ACTIVE, $subscription->status);
        $this->assertNotNull($subscription->sale_id);
        $this->assertDatabaseHas('sales', ['id' => $subscription->sale_id, 'total' => 1000, 'payment_method' => 'carte']);
    }

    public function test_three_month_plan_computes_ends_on_via_calendar_months_not_naive_days(): void
    {
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->hammamPlanWithWeeklyQuota($hammamService);
        $admin = $this->admin();

        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin, [
            'starts_on' => '2026-08-06',
        ]);

        // Calendar-accurate: Aug 6 + 3 months = Nov 6. A naive "*90 days"
        // calculation would land on Nov 4 instead — this date pair is chosen
        // specifically because the two approaches diverge.
        $this->assertSame('2026-11-06', $subscription->ends_on->toDateString());
    }

    public function test_second_weekly_usage_in_same_week_is_rejected_and_next_week_is_allowed(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->hammamPlanWithWeeklyQuota($hammamService);
        $admin = $this->admin();
        $planService = $plan->services()->first();

        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);

        $prestation1 = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );
        $item1 = $prestation1->items->first();

        app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation1, $item1, $user);
        $this->assertEquals(0, $item1->fresh()->unit_price);

        // Same calendar week — a second reservation must be rejected.
        $prestation2 = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );
        $item2 = $prestation2->items->first();

        $this->expectException(ValidationException::class);
        app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation2, $item2, $user);
    }

    public function test_usage_allowed_again_the_following_week(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->hammamPlanWithWeeklyQuota($hammamService);
        $admin = $this->admin();
        $planService = $plan->services()->first();

        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);

        $prestation1 = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );
        app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation1, $prestation1->items->first(), $user);

        Carbon::setTestNow(Carbon::now()->addWeeks(1));

        try {
            $prestation2 = app(PrestationService::class)->create(
                ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
                $employee,
                $user,
            );

            // No exception expected this time — the new week resets the quota.
            app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation2, $prestation2->items->first(), $user);
            $this->assertEquals(0, $prestation2->items->first()->fresh()->unit_price);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_lifetime_quota_is_never_bypassable_by_exception_override(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = SubscriptionPlan::create([
            'name' => 'Pack 1 hammam',
            'price' => 150,
            'duration_value' => 1,
            'duration_unit' => 'months',
            'is_active' => true,
        ]);
        $planService = $plan->services()->create([
            'service_id' => $hammamService->id,
            'quota_total' => 1,
        ]);
        $admin = $this->admin();

        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);

        $prestation1 = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );
        app(SubscriptionService::class)->reserveUsage($subscription, $planService, $prestation1, $prestation1->items->first(), $user);

        $prestation2 = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );

        $this->expectException(ValidationException::class);
        app(SubscriptionService::class)->reserveUsage(
            $subscription,
            $planService,
            $prestation2,
            $prestation2->items->first(),
            $admin,
            exceptionOverride: true,
            overrideReason: 'Geste commercial',
        );
    }

    public function test_subscription_expires_automatically_after_its_end_date(): void
    {
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->hammamPlanWithWeeklyQuota($hammamService);
        $admin = $this->admin();

        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin, ['starts_on' => '2026-01-01']);
        $this->assertSame('2026-04-01', $subscription->ends_on->toDateString());

        Carbon::setTestNow(Carbon::parse('2026-05-01'));
        try {
            $expiredCount = app(SubscriptionService::class)->expireDueSubscriptions();
            $this->assertSame(1, $expiredCount);
            $this->assertSame(ClientSubscription::STATUS_EXPIRED, $subscription->fresh()->status);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_duplicate_usage_slot_violates_the_database_unique_constraint(): void
    {
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $plan = $this->hammamPlanWithWeeklyQuota($hammamService);
        $admin = $this->admin();
        $planService = $plan->services()->first();
        $subscription = app(SubscriptionService::class)->purchase($client, $plan, $admin);

        ClientSubscriptionUsage::create([
            'client_subscription_id' => $subscription->id,
            'subscription_plan_service_id' => $planService->id,
            'status' => ClientSubscriptionUsage::STATUS_RESERVED,
            'used_on' => now()->toDateString(),
            'period_key' => 'week:2026-W32',
            'sequence_in_period' => 1,
        ]);

        // Even bypassing the service's own application-level count check, the
        // database itself refuses a second row for the exact same slot — the
        // real anti-double-click guarantee, independent of row-lock support.
        $this->expectException(QueryException::class);
        ClientSubscriptionUsage::create([
            'client_subscription_id' => $subscription->id,
            'subscription_plan_service_id' => $planService->id,
            'status' => ClientSubscriptionUsage::STATUS_RESERVED,
            'used_on' => now()->toDateString(),
            'period_key' => 'week:2026-W32',
            'sequence_in_period' => 1,
        ]);
    }
}
