<?php

namespace App\Console\Commands;

use App\Services\LoyaltyEngine;
use App\Services\LoyaltySettingsService;
use App\Services\Otp\OtpService;
use App\Services\SubscriptionService;
use Illuminate\Console\Command;

/**
 * Periodic sweep for every loyalty/subscription check that isn't sale-driven
 * and so can't hook into confirmPayment/store like the other program types:
 * birthday rewards, custom-condition programs, subscription/reward expiry,
 * expiry alerts, and OTP housekeeping. Safe to run as often as needed (daily
 * is enough) — every check is itself idempotent.
 */
class SweepLoyaltyPrograms extends Command
{
    protected $signature = 'loyalty:sweep';

    protected $description = 'Run the daily loyalty/subscription sweep: birthday rewards, custom programs, expiry + alerts, OTP cleanup';

    public function handle(
        LoyaltyEngine $loyaltyEngine,
        SubscriptionService $subscriptionService,
        OtpService $otpService,
        LoyaltySettingsService $settings,
    ): int {
        $birthdays = $loyaltyEngine->generateBirthdayRewards();
        $this->info("Récompenses anniversaire générées : {$birthdays}");

        $custom = $loyaltyEngine->evaluateCustomPrograms();
        $this->info("Récompenses (programmes personnalisés) générées : {$custom}");

        $expiredRewards = $loyaltyEngine->expireDueRewards();
        $this->info("Récompenses expirées : {$expiredRewards}");

        $expired = $subscriptionService->expireDueSubscriptions();
        $this->info("Abonnements expirés : {$expired}");

        $alertDays = (int) $settings->get('subscription_expiry_alert_days', 7);
        $subscriptionAlerts = $subscriptionService->notifyExpiringSubscriptions($alertDays);
        $this->info("Alertes d'expiration d'abonnement envoyées : {$subscriptionAlerts}");

        $rewardAlerts = $loyaltyEngine->notifyExpiringRewards($alertDays);
        $this->info("Alertes d'expiration de récompense envoyées : {$rewardAlerts}");

        $prunedOtps = $otpService->pruneExpired();
        $this->info("Codes OTP nettoyés : {$prunedOtps}");

        return self::SUCCESS;
    }
}
