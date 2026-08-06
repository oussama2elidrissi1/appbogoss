<?php

namespace App\Services;

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
    ) {
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
            $startsOn = isset($data['starts_on']) ? Carbon::parse($data['starts_on']) : Carbon::now();
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

            $today = Carbon::today();
            if ($today->lt($lockedSub->starts_on) || $today->gt($lockedSub->ends_on)) {
                throw ValidationException::withMessages(['client_subscription_id' => 'Cet abonnement n’est pas valide à cette date.']);
            }

            $periodKey = $planService->quota_period ? $this->periodKey($planService->quota_period, $today) : null;

            // Two different counts on purpose: quota enforcement only cares
            // about slots still actually consuming the allowance (reserved/
            // confirmed) — a released/voided usage frees the quota back up.
            // The unique-index sequence number, however, must never be
            // reused even by a voided row, or a fresh reservation would
            // collide with that now-inert row's slot (the unique index isn't
            // status-aware). So the sequence counts every attempt ever made,
            // successful or not.
            $countInPeriod = null;
            $attemptsInPeriod = null;
            if ($periodKey !== null) {
                $periodQuery = ClientSubscriptionUsage::where('client_subscription_id', $lockedSub->id)
                    ->where('subscription_plan_service_id', $planService->id)
                    ->where('period_key', $periodKey);

                $countInPeriod = (clone $periodQuery)->whereIn('status', [ClientSubscriptionUsage::STATUS_RESERVED, ClientSubscriptionUsage::STATUS_CONFIRMED])->count();

                if ($planService->quota_per_period !== null && $countInPeriod >= $planService->quota_per_period && ! $exceptionOverride) {
                    throw ValidationException::withMessages(['quota' => 'Quota atteint pour cette période.']);
                }

                $attemptsInPeriod = $periodQuery->count();
            }

            $countTotal = null;
            $attemptsTotal = null;
            if ($planService->quota_total !== null) {
                $totalQuery = ClientSubscriptionUsage::where('client_subscription_id', $lockedSub->id)
                    ->where('subscription_plan_service_id', $planService->id);

                $countTotal = (clone $totalQuery)->whereIn('status', [ClientSubscriptionUsage::STATUS_RESERVED, ClientSubscriptionUsage::STATUS_CONFIRMED])->count();

                // The lifetime quota is never bypassable, even with an exception override.
                if ($countTotal >= $planService->quota_total) {
                    throw ValidationException::withMessages(['quota' => 'Quota total de l’abonnement atteint.']);
                }

                $attemptsTotal = $totalQuery->count();
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
        return ClientSubscription::where('status', ClientSubscription::STATUS_ACTIVE)
            ->whereDate('ends_on', '<', now())
            ->update(['status' => ClientSubscription::STATUS_EXPIRED]);
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
