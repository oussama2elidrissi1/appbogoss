<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\ClientSubscriptionUsage;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SubscriptionPlan;
use App\Models\SubscriptionPlanService;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Purchase + usage/quota enforcement for subscription plans. Purchasing a
 * plan is a single atomic action (its own Sale, mirroring
 * TransactionController::store's self-contained pattern); redeeming an
 * included service reuses the Prestation workflow end to end (spec: "Créer
 * une prestation. Ajouter le service inclus. Prix client 0 MAD.").
 */
class SubscriptionService
{
    public function __construct(
        private readonly WorkDayService $workDayService,
        private readonly ActivityLogger $activityLogger,
        private readonly LoyaltyEngine $loyaltyEngine,
        private readonly LoyaltyNotifier $notifier,
        private readonly LoyaltySettingsService $settings,
    ) {
    }

    private function today(): Carbon
    {
        return Carbon::now($this->settings->get('loyalty_timezone', 'Africa/Casablanca'))->startOfDay();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function purchase(Client $client, SubscriptionPlan $plan, User $actor, array $data = []): ClientSubscription
    {
        $activeDay = $this->workDayService->getActiveDay();
        if ($activeDay === null) {
            throw ValidationException::withMessages([
                'work_day' => "Aucune journée ouverte. Ouvrez la journée avant de vendre un abonnement.",
            ]);
        }

        return DB::transaction(function () use ($client, $plan, $actor, $data, $activeDay) {
            $startsOn = isset($data['starts_on']) ? Carbon::parse($data['starts_on']) : $this->today();
            $endsOn = $plan->computeEndsOn($startsOn);

            $sale = Sale::create([
                'work_day_id' => $activeDay->id,
                'client_id' => $client->id,
                'employee_id' => null,
                'category' => null,
                'total' => $plan->price,
                'payment_method' => $data['payment_method'] ?? 'especes',
                'print_count' => 0,
            ]);

            SaleItem::create([
                'sale_id' => $sale->id,
                'itemable_type' => SubscriptionPlan::class,
                'itemable_id' => $plan->id,
                'label' => $plan->name,
                'quantity' => 1,
                'unit_price' => $plan->price,
            ]);

            $subscription = ClientSubscription::create([
                'client_id' => $client->id,
                'subscription_plan_id' => $plan->id,
                'plan_snapshot' => $plan->load('services.service')->toArray(),
                'status' => ClientSubscription::STATUS_ACTIVE,
                'purchased_at' => now(),
                'starts_on' => $startsOn->toDateString(),
                'ends_on' => $endsOn->toDateString(),
                'sale_id' => $sale->id,
            ]);

            $this->activityLogger->log('subscription.purchased', $subscription, [], [
                'plan' => $plan->name,
                'client_id' => $client->id,
                'price' => (float) $plan->price,
            ]);

            // The purchase itself is real revenue — a points/amount_spent
            // program with no service/category filter (e.g. "Points
            // BOGOSLAND") should accrue from it just like any other sale.
            // A category-scoped program (e.g. "5 Hammams") never matches
            // here since this Sale carries no category/service_id.
            $this->loyaltyEngine->processSale($sale);

            $this->notifier->notifyClient($client, 'subscription_activated', [
                'first_name' => explode(' ', trim($client->name))[0] ?? $client->name,
                'plan_name' => $plan->name,
                'ends_at' => $endsOn->format('d/m/Y'),
            ]);

            return $subscription->fresh(['plan', 'client']);
        });
    }

    public function reserveUsage(
        ClientSubscription $subscription,
        SubscriptionPlanService $planService,
        Prestation $prestation,
        PrestationItem $item,
        User $actor,
        bool $exceptionOverride = false,
        ?string $overrideReason = null,
    ): void {
        DB::transaction(function () use ($subscription, $planService, $prestation, $item, $actor, $exceptionOverride, $overrideReason) {
            $lockedSub = ClientSubscription::query()->whereKey($subscription->id)->lockForUpdate()->firstOrFail();

            if ($lockedSub->status !== ClientSubscription::STATUS_ACTIVE) {
                throw ValidationException::withMessages(['client_subscription_id' => 'Cet abonnement n’est pas actif.']);
            }

            if ($prestation->client_id === null || $lockedSub->client_id !== $prestation->client_id) {
                throw ValidationException::withMessages(['client_subscription_id' => 'Cet abonnement n’appartient pas à ce client.']);
            }

            $today = $this->today();
            // Compared as calendar-date strings, not datetime instants —
            // starts_on/ends_on are plain dates, and $today carries the
            // salon's timezone (see loyalty_timezone setting) which would
            // otherwise shift the instant across a date boundary relative
            // to the app's own (UTC) timezone.
            $todayDate = $today->toDateString();
            if ($todayDate < $lockedSub->starts_on->toDateString() || $todayDate > $lockedSub->ends_on->toDateString()) {
                throw ValidationException::withMessages(['client_subscription_id' => 'Cet abonnement n’est pas valide à cette date.']);
            }

            $periodKey = $planService->quota_period ? $this->periodKey($planService->quota_period, $today) : null;

            $quota = $this->quotaCounts($lockedSub, $planService, $periodKey);
            [
                'count_in_period' => $countInPeriod,
                'attempts_in_period' => $attemptsInPeriod,
                'count_total' => $countTotal,
                'attempts_total' => $attemptsTotal,
            ] = $quota;

            if ($periodKey !== null && $planService->quota_per_period !== null && $countInPeriod >= $planService->quota_per_period && ! $exceptionOverride) {
                throw ValidationException::withMessages(['quota' => 'Quota atteint pour cette période.']);
            }

            if ($planService->quota_total !== null && $countTotal >= $planService->quota_total) {
                // The lifetime quota is never bypassable, even with an exception override.
                throw ValidationException::withMessages(['quota' => 'Quota total de l’abonnement atteint.']);
            }

            try {
                $usage = ClientSubscriptionUsage::create([
                    'client_subscription_id' => $lockedSub->id,
                    'subscription_plan_service_id' => $planService->id,
                    'status' => ClientSubscriptionUsage::STATUS_RESERVED,
                    'reserved_prestation_id' => $prestation->id,
                    'used_on' => $today->toDateString(),
                    'period_key' => $periodKey,
                    'sequence_in_period' => $periodKey !== null ? $attemptsInPeriod + 1 : null,
                    'sequence_total' => $planService->quota_total !== null ? $attemptsTotal + 1 : null,
                    'exception_override' => $exceptionOverride,
                    'override_reason' => $overrideReason,
                    'override_by_user_id' => $exceptionOverride ? $actor->id : null,
                ]);
            } catch (QueryException $e) {
                // Unique-index collision — the real anti-double-click guarantee,
                // independent of whether the DB driver supports row locking.
                throw ValidationException::withMessages([
                    'quota' => 'Ce créneau vient d’être utilisé, réessayez.',
                ]);
            }

            $publicPrice = (float) ($planService->service?->price ?? $item->unit_price);
            $item->update([
                'client_subscription_id' => $lockedSub->id,
                'is_free' => true,
                'public_price' => $publicPrice,
                'unit_price' => 0,
            ]);

            $this->activityLogger->log('subscription.usage_reserved', $usage, [], [
                'prestation_id' => $prestation->id,
                'exception_override' => $exceptionOverride,
            ]);
        });
    }

    public function release(ClientSubscriptionUsage $usage): void
    {
        DB::transaction(function () use ($usage) {
            $locked = ClientSubscriptionUsage::query()->whereKey($usage->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== ClientSubscriptionUsage::STATUS_RESERVED) {
                return;
            }

            $locked->update(['status' => ClientSubscriptionUsage::STATUS_VOIDED]);
            $this->activityLogger->log('subscription.usage_voided', $locked);
        });
    }

    public function confirmUsage(ClientSubscriptionUsage $usage, PrestationItem $item): void
    {
        $locked = ClientSubscriptionUsage::query()->whereKey($usage->id)->lockForUpdate()->firstOrFail();

        if ($locked->status !== ClientSubscriptionUsage::STATUS_RESERVED || $locked->reserved_prestation_id !== $item->prestation_id) {
            throw ValidationException::withMessages([
                'client_subscription_id' => 'Cette utilisation n’est plus valide pour cette prestation.',
            ]);
        }

        $locked->update([
            'status' => ClientSubscriptionUsage::STATUS_CONFIRMED,
            'prestation_item_id' => $item->id,
        ]);

        $this->activityLogger->log('subscription.usage_confirmed', $locked, [], ['prestation_item_id' => $item->id]);

        $subscription = $locked->subscription;
        $client = $subscription?->client;
        if ($client !== null) {
            $this->notifier->notifyClient($client, 'subscription_used', [
                'first_name' => explode(' ', trim($client->name))[0] ?? $client->name,
                'plan_name' => $subscription->plan?->name ?? 'abonnement',
            ]);
        }
    }

    public function reverseUsageForSale(Prestation $prestation): void
    {
        $prestation->loadMissing('items');
        $itemIds = $prestation->items->pluck('id');

        if ($itemIds->isEmpty()) {
            return;
        }

        ClientSubscriptionUsage::whereIn('prestation_item_id', $itemIds)
            ->where('status', ClientSubscriptionUsage::STATUS_CONFIRMED)
            ->get()
            ->each(function (ClientSubscriptionUsage $usage) use ($prestation) {
                $locked = ClientSubscriptionUsage::query()->whereKey($usage->id)->lockForUpdate()->first();
                if ($locked === null) {
                    return;
                }
                $locked->update(['status' => ClientSubscriptionUsage::STATUS_VOIDED]);
                $this->activityLogger->log('subscription.usage_reversed', $locked, [], ['prestation_id' => $prestation->id]);
            });
    }

    public function expireDueSubscriptions(): int
    {
        $due = ClientSubscription::where('status', ClientSubscription::STATUS_ACTIVE)
            ->whereDate('ends_on', '<', $this->today())
            ->with('client', 'plan')
            ->get();

        foreach ($due as $subscription) {
            $subscription->update(['status' => ClientSubscription::STATUS_EXPIRED]);
            $this->activityLogger->log('subscription.expired', $subscription);

            if ($subscription->client !== null) {
                $this->notifier->notifyClient($subscription->client, 'subscription_expired', [
                    'first_name' => explode(' ', trim($subscription->client->name))[0] ?? $subscription->client->name,
                    'plan_name' => $subscription->plan?->name ?? 'abonnement',
                ]);
            }
        }

        return $due->count();
    }

    /**
     * Date-driven sweep (see loyalty:sweep) — notifies clients whose active
     * subscription ends within the configured alert window, at most once
     * per subscription per day (guarded by activity_logs rather than a new
     * column, since this is a pure notification concern).
     */
    public function notifyExpiringSubscriptions(int $withinDays): int
    {
        $threshold = $this->today()->addDays($withinDays);

        $subscriptions = ClientSubscription::where('status', ClientSubscription::STATUS_ACTIVE)
            ->whereDate('ends_on', '<=', $threshold)
            ->whereDate('ends_on', '>=', $this->today())
            ->with('client', 'plan')
            ->get();

        $notified = 0;
        foreach ($subscriptions as $subscription) {
            if ($subscription->client === null) {
                continue;
            }

            $alreadyNotifiedToday = ActivityLog::where('subject_type', ClientSubscription::class)
                ->where('subject_id', $subscription->id)
                ->where('action', 'subscription.expiry_alert_sent')
                ->whereDate('created_at', $this->today())
                ->exists();
            if ($alreadyNotifiedToday) {
                continue;
            }

            $this->notifier->notifyClient($subscription->client, 'subscription_expiring_soon', [
                'first_name' => explode(' ', trim($subscription->client->name))[0] ?? $subscription->client->name,
                'plan_name' => $subscription->plan?->name ?? 'abonnement',
                'ends_at' => $subscription->ends_on->format('d/m/Y'),
            ]);
            $this->activityLogger->log('subscription.expiry_alert_sent', $subscription);
            $notified++;
        }

        return $notified;
    }

    /**
     * §17 — blocks consumption for the given window; if the plan allows
     * freezing duration, ends_on is pushed back by exactly the suspended
     * span so the client doesn't lose paid-for time.
     */
    public function suspend(ClientSubscription $subscription, Carbon $from, Carbon $until, string $reason, User $actor): ClientSubscription
    {
        if (! ($subscription->plan?->allow_suspension)) {
            throw ValidationException::withMessages(['status' => 'Ce plan n’autorise pas la suspension.']);
        }
        if ($subscription->status !== ClientSubscription::STATUS_ACTIVE) {
            throw ValidationException::withMessages(['status' => 'Seul un abonnement actif peut être suspendu.']);
        }

        $old = $subscription->only(['status', 'ends_on']);

        $subscription->update([
            'status' => ClientSubscription::STATUS_SUSPENDED,
            'suspension_starts_on' => $from->toDateString(),
            'suspension_ends_on' => $until->toDateString(),
            'suspension_reason' => $reason,
            'ends_on' => $subscription->ends_on->addDays($from->diffInDays($until)),
        ]);

        $this->activityLogger->log('subscription.suspended', $subscription, $old, [
            'suspension_starts_on' => $from->toDateString(),
            'suspension_ends_on' => $until->toDateString(),
            'reason' => $reason,
            'by' => $actor->name,
        ]);

        return $subscription->fresh();
    }

    public function resume(ClientSubscription $subscription, User $actor): ClientSubscription
    {
        if ($subscription->status !== ClientSubscription::STATUS_SUSPENDED) {
            throw ValidationException::withMessages(['status' => 'Cet abonnement n’est pas suspendu.']);
        }

        $subscription->update([
            'status' => ClientSubscription::STATUS_ACTIVE,
            'suspension_starts_on' => null,
            'suspension_ends_on' => null,
        ]);

        $this->activityLogger->log('subscription.resumed', $subscription, [], ['by' => $actor->name]);

        return $subscription->fresh();
    }

    /**
     * §11 — Super Admin correction, e.g. compensating a service outage.
     * Always logged with the actor + reason, never silent.
     */
    public function extend(ClientSubscription $subscription, int $days, string $reason, User $actor): ClientSubscription
    {
        if ($days <= 0) {
            throw ValidationException::withMessages(['days' => 'Le nombre de jours doit être positif.']);
        }

        $old = $subscription->only(['ends_on']);
        $subscription->update(['ends_on' => $subscription->ends_on->copy()->addDays($days)]);

        $this->activityLogger->log('subscription.extended', $subscription, $old, [
            'ends_on' => $subscription->ends_on->toDateString(),
            'days' => $days,
            'reason' => $reason,
            'by' => $actor->name,
        ]);

        return $subscription->fresh();
    }

    /**
     * §18 — a manual renewal never overwrites the old record: a fresh
     * ClientSubscription is created, linked via renewed_from_id, so the
     * history (old usages, old dates) stays intact.
     */
    public function renew(ClientSubscription $subscription, User $actor, array $data = []): ClientSubscription
    {
        if (! ($subscription->plan?->allow_renewal)) {
            throw ValidationException::withMessages(['status' => 'Ce plan n’autorise pas le renouvellement.']);
        }
        if ($subscription->client === null) {
            throw ValidationException::withMessages(['status' => 'Client introuvable pour cet abonnement.']);
        }

        $data['starts_on'] = $data['starts_on'] ?? max($this->today()->toDateString(), $subscription->ends_on->toDateString());

        $renewed = $this->purchase($subscription->client, $subscription->plan, $actor, $data);
        $renewed->update(['renewed_from_id' => $subscription->id]);

        $this->activityLogger->log('subscription.renewed', $renewed, [], ['renewed_from_id' => $subscription->id]);

        return $renewed->fresh(['plan', 'client']);
    }

    /**
     * Read-only quota preview for a subscription/service pair, today — same
     * counts reserveUsage() enforces (via quotaCounts()), so this can never
     * drift from what actually gets accepted. Null means "no limit."
     *
     * @return array{period_remaining: int|null, total_remaining: int|null, period_key: string|null}
     */
    public function quotaRemaining(ClientSubscription $subscription, SubscriptionPlanService $planService): array
    {
        $today = $this->today();
        $periodKey = $planService->quota_period ? $this->periodKey($planService->quota_period, $today) : null;

        $counts = $this->quotaCounts($subscription, $planService, $periodKey);

        return [
            'period_remaining' => $planService->quota_per_period !== null
                ? max(0, $planService->quota_per_period - $counts['count_in_period'])
                : null,
            'total_remaining' => $planService->quota_total !== null
                ? max(0, $planService->quota_total - $counts['count_total'])
                : null,
            'period_key' => $periodKey,
        ];
    }

    /**
     * Two different counts on purpose: quota enforcement only cares about
     * slots still actually consuming the allowance (reserved/confirmed) — a
     * released/voided usage frees the quota back up. The unique-index
     * sequence number, however, must never be reused even by a voided row,
     * or a fresh reservation would collide with that now-inert row's slot
     * (the unique index isn't status-aware). So the sequence counts every
     * attempt ever made, successful or not.
     *
     * @return array{count_in_period: int, attempts_in_period: int, count_total: int, attempts_total: int}
     */
    private function quotaCounts(ClientSubscription $subscription, SubscriptionPlanService $planService, ?string $periodKey): array
    {
        $countInPeriod = 0;
        $attemptsInPeriod = 0;
        if ($periodKey !== null) {
            $periodQuery = ClientSubscriptionUsage::where('client_subscription_id', $subscription->id)
                ->where('subscription_plan_service_id', $planService->id)
                ->where('period_key', $periodKey);

            $countInPeriod = (clone $periodQuery)->whereIn('status', [ClientSubscriptionUsage::STATUS_RESERVED, ClientSubscriptionUsage::STATUS_CONFIRMED])->count();
            $attemptsInPeriod = $periodQuery->count();
        }

        $countTotal = 0;
        $attemptsTotal = 0;
        if ($planService->quota_total !== null) {
            $totalQuery = ClientSubscriptionUsage::where('client_subscription_id', $subscription->id)
                ->where('subscription_plan_service_id', $planService->id);

            $countTotal = (clone $totalQuery)->whereIn('status', [ClientSubscriptionUsage::STATUS_RESERVED, ClientSubscriptionUsage::STATUS_CONFIRMED])->count();
            $attemptsTotal = $totalQuery->count();
        }

        return [
            'count_in_period' => $countInPeriod,
            'attempts_in_period' => $attemptsInPeriod,
            'count_total' => $countTotal,
            'attempts_total' => $attemptsTotal,
        ];
    }

    private function periodKey(string $period, Carbon $date): string
    {
        return match ($period) {
            'day' => 'day:'.$date->toDateString(),
            'week' => 'week:'.$date->format('o-\WW'),
            'month' => 'month:'.$date->format('Y-m'),
            default => 'all',
        };
    }
}
