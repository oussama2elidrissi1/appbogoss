<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyReward;
use App\Models\SubscriptionPlan;
use Carbon\Carbon;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SweepLoyaltyProgramsCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_sweep_generates_birthday_rewards_and_expires_due_subscriptions(): void
    {
        $client = Client::factory()->create(['birth_date' => Carbon::now()->subYears(30)->toDateString()]);

        LoyaltyProgram::create([
            'name' => 'Anniversaire',
            'type' => LoyaltyProgram::TYPE_BIRTHDAY,
            'is_active' => true,
            'config' => ['reward' => ['type' => 'discount_amount', 'value' => 50]],
            'commission_basis' => 'fixed',
            'commission_value' => 50,
        ]);

        $plan = SubscriptionPlan::create([
            'name' => 'Hammam 3 mois',
            'price' => 1000,
            'duration_value' => 3,
            'duration_unit' => 'months',
            'is_active' => true,
        ]);
        $expiredSubscription = ClientSubscription::create([
            'client_id' => $client->id,
            'subscription_plan_id' => $plan->id,
            'plan_snapshot' => [],
            'status' => ClientSubscription::STATUS_ACTIVE,
            'purchased_at' => now()->subMonths(4),
            'starts_on' => now()->subMonths(4)->toDateString(),
            'ends_on' => now()->subMonth()->toDateString(),
        ]);

        $this->artisan('loyalty:sweep')->assertExitCode(0);

        $this->assertTrue(
            LoyaltyReward::where('client_id', $client->id)->exists(),
            'The birthday sweep should have generated a reward for a client whose birthday falls this week.'
        );
        $this->assertSame(ClientSubscription::STATUS_EXPIRED, $expiredSubscription->fresh()->status);
    }
}
