<?php

namespace App\Console\Commands;

use App\Services\LoyaltyEngine;
use App\Services\SubscriptionService;
use Illuminate\Console\Command;

/**
 * Periodic sweep for the three loyalty/subscription checks that aren't
 * sale-driven and so can't hook into confirmPayment/store like the other
 * program types: birthday rewards, custom-condition programs, and
 * subscription expiry. Safe to run as often as needed (daily is enough) —
 * every check is itself idempotent (see LoyaltyEngine::generateBirthdayRewards/
 * evaluateCustomPrograms, SubscriptionService::expireDueSubscriptions).
 */
class SweepLoyaltyPrograms extends Command
{
    protected $signature = 'loyalty:sweep';

    protected $description = 'Run the daily loyalty/subscription sweep: birthday rewards, custom programs, subscription expiry';

    public function handle(LoyaltyEngine $loyaltyEngine, SubscriptionService $subscriptionService): int
    {
        $birthdays = $loyaltyEngine->generateBirthdayRewards();
        $this->info("Récompenses anniversaire générées : {$birthdays}");

        $custom = $loyaltyEngine->evaluateCustomPrograms();
        $this->info("Récompenses (programmes personnalisés) générées : {$custom}");

        $expired = $subscriptionService->expireDueSubscriptions();
        $this->info("Abonnements expirés : {$expired}");

        return self::SUCCESS;
    }
}
