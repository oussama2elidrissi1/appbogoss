<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\CustomerOtpCode;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyReward;
use App\Models\SubscriptionPlan;
use Carbon\Carbon;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
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

    public function test_sweep_expires_due_rewards_and_alerts_soon_to_expire_ones(): void
    {
        $program = LoyaltyProgram::create([
            'name' => '5 Hammams',
            'type' => LoyaltyProgram::TYPE_SERVICE_COUNT,
            'is_active' => true,
            'config' => ['threshold' => 5, 'reward' => ['type' => 'service']],
        ]);

        $pastClient = Client::factory()->create();
        $pastReward = LoyaltyReward::create([
            'client_id' => $pastClient->id,
            'loyalty_program_id' => $program->id,
            'program_snapshot' => [],
            'type' => 'service',
            'status' => LoyaltyReward::STATUS_AVAILABLE,
            'generated_at' => now()->subDays(40),
            'expires_at' => now()->subDay(),
        ]);

        $soonClient = Client::factory()->create();
        $soonReward = LoyaltyReward::create([
            'client_id' => $soonClient->id,
            'loyalty_program_id' => $program->id,
            'program_snapshot' => [],
            'type' => 'service',
            'status' => LoyaltyReward::STATUS_AVAILABLE,
            'generated_at' => now()->subDays(28),
            'expires_at' => now()->addDays(3),
        ]);

        $this->artisan('loyalty:sweep')->assertExitCode(0);

        $this->assertSame(LoyaltyReward::STATUS_EXPIRED, $pastReward->fresh()->status);
        $this->assertSame(LoyaltyReward::STATUS_AVAILABLE, $soonReward->fresh()->status);
        $this->assertTrue(
            ActivityLog::where('subject_type', LoyaltyReward::class)
                ->where('subject_id', $soonReward->id)
                ->where('action', 'loyalty.reward_expiry_alert_sent')
                ->exists()
        );

        // Running the sweep again the same day must not send a duplicate alert.
        $this->artisan('loyalty:sweep')->assertExitCode(0);
        $this->assertSame(
            1,
            ActivityLog::where('subject_type', LoyaltyReward::class)
                ->where('subject_id', $soonReward->id)
                ->where('action', 'loyalty.reward_expiry_alert_sent')
                ->count()
        );
    }

    public function test_sweep_prunes_stale_otp_codes_but_keeps_recent_ones(): void
    {
        $stale = CustomerOtpCode::create([
            'phone_e164' => '+212612345678',
            'code_hash' => Hash::make('123456'),
            'purpose' => CustomerOtpCode::PURPOSE_LOGIN,
            'max_attempts' => 5,
            'expires_at' => now()->subDays(2),
        ]);
        $recentExpired = CustomerOtpCode::create([
            'phone_e164' => '+212612345679',
            'code_hash' => Hash::make('123456'),
            'purpose' => CustomerOtpCode::PURPOSE_LOGIN,
            'max_attempts' => 5,
            'expires_at' => now()->subMinutes(10),
        ]);

        $this->artisan('loyalty:sweep')->assertExitCode(0);

        $this->assertModelMissing($stale);
        $this->assertModelExists($recentExpired);
    }
}
