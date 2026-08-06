<?php

namespace Database\Seeders;

use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\ClientSubscriptionUsage;
use App\Models\CustomerLoyaltyAccount;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyProgramProgress;
use App\Models\LoyaltyReward;
use App\Models\Service;
use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

/**
 * Seeds the two mandatory demo loyalty programs, the mandatory "Hammam 3
 * mois" subscription plan, and a handful of demo customer loyalty accounts
 * at different stages (in-progress, reward earned, reward used, active
 * subscription, expired subscription) so the engine can be exercised without
 * hand-building every scenario through the API. Entirely firstOrCreate for
 * the program/plan config (safe to re-run); demo account data is
 * existence-guarded per client so re-running doesn't pile up duplicates.
 */
class LoyaltyAndSubscriptionSeeder extends Seeder
{
    public function run(): void
    {
        $hammamTurc = Service::where('category', 'hammam')->where('name', 'like', '%turc%')->first()
            ?? Service::where('category', 'hammam')->first();

        if ($hammamTurc === null) {
            $this->command?->warn('Aucun service "hammam" trouvé — LoyaltyAndSubscriptionSeeder ignoré.');

            return;
        }

        $hammamProgram = LoyaltyProgram::firstOrCreate(
            ['name' => '5 Hammams = 1 Gratuit'],
            [
                'description' => 'Après 5 hammams payés (toute catégorie hammam confondue), le client reçoit un hammam gratuit.',
                'type' => LoyaltyProgram::TYPE_SERVICE_COUNT,
                'is_active' => true,
                'config' => [
                    'category' => 'hammam',
                    'threshold' => 5,
                    'rollover_surplus' => true,
                    'reward_expires_after_days' => 30,
                    'reward' => [
                        'type' => 'service',
                        'service_id' => $hammamTurc->id,
                    ],
                ],
                'commission_basis' => 'public_price',
                'starts_on' => now()->subMonths(2)->toDateString(),
            ],
        );

        $pointsProgram = LoyaltyProgram::firstOrCreate(
            ['name' => 'Points BOGOSLAND'],
            [
                'description' => '1 MAD payé = 1 point. 500 points = 50 MAD de réduction.',
                'type' => LoyaltyProgram::TYPE_POINTS,
                'is_active' => true,
                'config' => [
                    'points_per_mad' => 1,
                    'threshold' => 500,
                    'rollover_surplus' => true,
                    'reward_expires_after_days' => 60,
                    'reward' => [
                        'type' => 'discount_amount',
                        'value' => 50,
                    ],
                ],
                'commission_basis' => 'none',
                'starts_on' => now()->subMonths(2)->toDateString(),
            ],
        );

        $hammamPlan = SubscriptionPlan::firstOrCreate(
            ['name' => 'Hammam 3 mois'],
            [
                'description' => '1 hammam par semaine pendant 3 mois.',
                'price' => 1000,
                'duration_value' => 3,
                'duration_unit' => 'months',
                'is_active' => true,
            ],
        );

        if ($hammamPlan->services()->count() === 0) {
            $hammamPlan->services()->create([
                'service_id' => $hammamTurc->id,
                'quota_period' => 'week',
                'quota_per_period' => 1,
                'quota_total' => null,
                'allow_rollover' => false,
                'commission_basis' => 'public_price',
            ]);
        }

        $demoClients = Client::inRandomOrder()->limit(5)->get();
        if ($demoClients->count() < 5) {
            return;
        }

        [$inProgressClient, $rewardAvailableClient, $rewardUsedClient, $activeSubClient, $expiredSubClient] = $demoClients->all();

        // 1) In progress toward the free hammam (4/5).
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $inProgressClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        LoyaltyProgramProgress::firstOrCreate(
            ['client_id' => $inProgressClient->id, 'loyalty_program_id' => $hammamProgram->id],
            ['counter' => 4, 'last_activity_at' => now()->subDays(3)],
        );

        // 2) Reward earned, not yet used.
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $rewardAvailableClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        LoyaltyProgramProgress::firstOrCreate(
            ['client_id' => $rewardAvailableClient->id, 'loyalty_program_id' => $hammamProgram->id],
            ['counter' => 0, 'last_activity_at' => now()->subDays(1)],
        );
        if (! LoyaltyReward::where('client_id', $rewardAvailableClient->id)->where('loyalty_program_id', $hammamProgram->id)->exists()) {
            LoyaltyReward::create([
                'client_id' => $rewardAvailableClient->id,
                'loyalty_program_id' => $hammamProgram->id,
                'program_snapshot' => $hammamProgram->toArray(),
                'type' => 'service',
                'status' => LoyaltyReward::STATUS_AVAILABLE,
                'service_id' => $hammamTurc->id,
                'commission_basis' => $hammamProgram->commission_basis,
                'generated_at' => now()->subDays(1),
                'expires_at' => now()->addDays(29),
            ]);
        }

        // 3) Reward already used (history).
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $rewardUsedClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        if (! LoyaltyReward::where('client_id', $rewardUsedClient->id)->where('status', LoyaltyReward::STATUS_USED)->exists()) {
            LoyaltyReward::create([
                'client_id' => $rewardUsedClient->id,
                'loyalty_program_id' => $hammamProgram->id,
                'program_snapshot' => $hammamProgram->toArray(),
                'type' => 'service',
                'status' => LoyaltyReward::STATUS_USED,
                'service_id' => $hammamTurc->id,
                'commission_basis' => $hammamProgram->commission_basis,
                'generated_at' => now()->subDays(20),
                'expires_at' => now()->addDays(10),
                'used_at' => now()->subDays(5),
            ]);
        }

        // 4) Active subscription, no usage yet this week.
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $activeSubClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        $activeSub = ClientSubscription::firstOrCreate(
            ['client_id' => $activeSubClient->id, 'subscription_plan_id' => $hammamPlan->id, 'status' => ClientSubscription::STATUS_ACTIVE],
            [
                'plan_snapshot' => $hammamPlan->load('services.service')->toArray(),
                'purchased_at' => now()->subWeeks(2),
                'starts_on' => now()->subWeeks(2)->toDateString(),
                'ends_on' => now()->addMonths(3)->subWeeks(2)->toDateString(),
            ],
        );
        if ($activeSub->usages()->count() === 0) {
            $planService = $hammamPlan->services()->first();
            ClientSubscriptionUsage::create([
                'client_subscription_id' => $activeSub->id,
                'subscription_plan_service_id' => $planService->id,
                'status' => ClientSubscriptionUsage::STATUS_CONFIRMED,
                'used_on' => now()->subWeek()->toDateString(),
                'period_key' => 'week:'.now()->subWeek()->format('o-\WW'),
                'sequence_in_period' => 1,
            ]);
        }

        // 5) Expired subscription (history).
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $expiredSubClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        ClientSubscription::firstOrCreate(
            ['client_id' => $expiredSubClient->id, 'subscription_plan_id' => $hammamPlan->id, 'status' => ClientSubscription::STATUS_EXPIRED],
            [
                'plan_snapshot' => $hammamPlan->load('services.service')->toArray(),
                'purchased_at' => now()->subMonths(4),
                'starts_on' => now()->subMonths(4)->toDateString(),
                'ends_on' => now()->subMonths(1)->toDateString(),
            ],
        );
    }
}
