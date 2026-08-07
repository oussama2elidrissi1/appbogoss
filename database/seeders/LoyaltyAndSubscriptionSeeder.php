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
use Illuminate\Support\Facades\DB;

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

        $birthdayProgram = LoyaltyProgram::firstOrCreate(
            ['name' => 'Anniversaire BOGOSLAND'],
            [
                'description' => 'Une réduction de bienvenue offerte la semaine de l’anniversaire du client.',
                'type' => LoyaltyProgram::TYPE_BIRTHDAY,
                'is_active' => true,
                'config' => [
                    'reward_expires_after_days' => 14,
                    'reward' => ['type' => 'discount_amount', 'value' => 50],
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
                'allow_suspension' => true,
                'allow_renewal' => true,
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

        // Deterministic (not random) selection — re-running this seeder must
        // always land on the exact same 11 clients, otherwise scenario 11's
        // fixed demo phone number collides with whichever client held it
        // from a previous run (unique constraint on clients.phone_e164).
        $demoClients = Client::orderBy('id')->limit(11)->get();
        if ($demoClients->count() < 11) {
            return;
        }

        [
            $inProgressClient,
            $rewardAvailableClient,
            $rewardUsedClient,
            $activeSubClient,
            $expiredSubClient,
            $pointsProgressClient,
            $rewardExpiringSoonClient,
            $subExpiringSoonClient,
            $suspendedSubClient,
            $birthdayClient,
            $portalDemoClient,
        ] = $demoClients->all();

        DB::transaction(function () use (
            $hammamProgram,
            $pointsProgram,
            $hammamPlan,
            $hammamTurc,
            $inProgressClient,
            $rewardAvailableClient,
            $rewardUsedClient,
            $activeSubClient,
            $expiredSubClient,
            $pointsProgressClient,
            $rewardExpiringSoonClient,
            $subExpiringSoonClient,
            $suspendedSubClient,
            $birthdayClient,
            $portalDemoClient,
        ) {
            $this->seedDemoScenarios(
                $hammamProgram,
                $pointsProgram,
                $hammamPlan,
                $hammamTurc,
                $inProgressClient,
                $rewardAvailableClient,
                $rewardUsedClient,
                $activeSubClient,
                $expiredSubClient,
                $pointsProgressClient,
                $rewardExpiringSoonClient,
                $subExpiringSoonClient,
                $suspendedSubClient,
                $birthdayClient,
                $portalDemoClient,
            );
        });
    }

    private function seedDemoScenarios(
        LoyaltyProgram $hammamProgram,
        LoyaltyProgram $pointsProgram,
        SubscriptionPlan $hammamPlan,
        Service $hammamTurc,
        Client $inProgressClient,
        Client $rewardAvailableClient,
        Client $rewardUsedClient,
        Client $activeSubClient,
        Client $expiredSubClient,
        Client $pointsProgressClient,
        Client $rewardExpiringSoonClient,
        Client $subExpiringSoonClient,
        Client $suspendedSubClient,
        Client $birthdayClient,
        Client $portalDemoClient,
    ): void {

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

        // 6) Partial progress on the points program (320 / 500).
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $pointsProgressClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        LoyaltyProgramProgress::firstOrCreate(
            ['client_id' => $pointsProgressClient->id, 'loyalty_program_id' => $pointsProgram->id],
            ['points_balance' => 320, 'last_activity_at' => now()->subDays(2)],
        );

        // 7) Reward expiring within the alert window — exercises loyalty:sweep's
        // notifyExpiringRewards() and the portal's "alerts" block.
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $rewardExpiringSoonClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        if (! LoyaltyReward::where('client_id', $rewardExpiringSoonClient->id)->where('status', LoyaltyReward::STATUS_AVAILABLE)->exists()) {
            LoyaltyReward::create([
                'client_id' => $rewardExpiringSoonClient->id,
                'loyalty_program_id' => $hammamProgram->id,
                'program_snapshot' => $hammamProgram->toArray(),
                'type' => 'service',
                'status' => LoyaltyReward::STATUS_AVAILABLE,
                'service_id' => $hammamTurc->id,
                'commission_basis' => $hammamProgram->commission_basis,
                'generated_at' => now()->subDays(27),
                'expires_at' => now()->addDays(3),
            ]);
        }

        // 8) Subscription expiring within the alert window — same purpose for
        // SubscriptionService::notifyExpiringSubscriptions().
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $subExpiringSoonClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        ClientSubscription::firstOrCreate(
            ['client_id' => $subExpiringSoonClient->id, 'subscription_plan_id' => $hammamPlan->id, 'status' => ClientSubscription::STATUS_ACTIVE],
            [
                'plan_snapshot' => $hammamPlan->load('services.service')->toArray(),
                'purchased_at' => now()->subMonths(3)->addDays(4),
                'starts_on' => now()->subMonths(3)->addDays(4)->toDateString(),
                'ends_on' => now()->addDays(4)->toDateString(),
            ],
        );

        // 9) Suspended subscription — exercises §17 (portal shows "Suspendu",
        // resume() is testable against a real row).
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $suspendedSubClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        ClientSubscription::firstOrCreate(
            ['client_id' => $suspendedSubClient->id, 'subscription_plan_id' => $hammamPlan->id, 'status' => ClientSubscription::STATUS_SUSPENDED],
            [
                'plan_snapshot' => $hammamPlan->load('services.service')->toArray(),
                'purchased_at' => now()->subMonths(1),
                'starts_on' => now()->subMonths(1)->toDateString(),
                'ends_on' => now()->addMonths(2)->toDateString(),
                'suspension_starts_on' => now()->subDays(5)->toDateString(),
                'suspension_ends_on' => now()->addDays(9)->toDateString(),
                'suspension_reason' => 'Voyage — demande du client.',
            ],
        );

        // 10) Birthday this week — exercises loyalty:sweep's generateBirthdayRewards().
        $birthdayClient->update(['birth_date' => now()->startOfWeek()->addDay()->year(now()->year - 28)->toDateString()]);
        CustomerLoyaltyAccount::firstOrCreate(['client_id' => $birthdayClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);

        // 11) Fully portal-ready demo account — known phone + password so QA
        // can log into /mon-compte/connexion directly without going through
        // /join every time.
        $portalDemoClient->update([
            'phone_e164' => '+212600000001',
            'phone_verified_at' => now()->subDays(10),
            'registered_at' => now()->subDays(10),
            'consent_terms_at' => now()->subDays(10),
            'consent_marketing_at' => now()->subDays(10),
        ]);
        if ($portalDemoClient->password === null) {
            // Hashed automatically by Client's 'password' => 'hashed' cast.
            $portalDemoClient->update(['password' => 'Bogosland2026!']);
        }
        $portalAccount = CustomerLoyaltyAccount::firstOrCreate(['client_id' => $portalDemoClient->id], ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE]);
        LoyaltyProgramProgress::firstOrCreate(
            ['client_id' => $portalDemoClient->id, 'loyalty_program_id' => $hammamProgram->id],
            ['counter' => 2, 'last_activity_at' => now()->subDays(6)],
        );
        if ($portalAccount->loyalty_number === null) {
            $portalAccount->update(['loyalty_number' => CustomerLoyaltyAccount::generateLoyaltyNumber()]);
        }

        $this->command?->info('Compte portail de démo : +212600000001 / Bogosland2026! (connexion via /mon-compte/connexion).');
    }
}
