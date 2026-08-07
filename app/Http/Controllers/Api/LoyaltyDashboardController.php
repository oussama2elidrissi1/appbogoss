<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\CustomerLoyaltyAccount;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyReward;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Fidélité → Tableau de bord (§20). Read-only aggregates over the existing
 * loyalty tables — no new reporting tables, computed on request.
 */
class LoyaltyDashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', 'in:7d,30d,month,custom'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        [$from, $to] = $this->resolvePeriod($validated);

        $rewardsGenerated = LoyaltyReward::whereBetween('generated_at', [$from, $to])->count();
        $rewardsUsed = LoyaltyReward::where('status', LoyaltyReward::STATUS_USED)
            ->whereBetween('used_at', [$from, $to])
            ->count();

        $subscriptionsSold = ClientSubscription::whereBetween('purchased_at', [$from, $to])->count();
        $subscriptionsRevenue = (float) ClientSubscription::whereBetween('purchased_at', [$from, $to])
            ->join('subscription_plans', 'subscription_plans.id', '=', 'client_subscriptions.subscription_plan_id')
            ->sum('subscription_plans.price');

        return response()->json(['data' => [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpis' => [
                'members_count' => CustomerLoyaltyAccount::count(),
                'new_members_today' => Client::whereDate('registered_at', now()->toDateString())->count(),
                'new_members_this_month' => Client::whereBetween('registered_at', [now()->startOfMonth(), now()->endOfMonth()])->count(),
                'active_programs_count' => LoyaltyProgram::where('is_active', true)->count(),
                'rewards_generated' => $rewardsGenerated,
                'rewards_used' => $rewardsUsed,
                'usage_rate' => $rewardsGenerated > 0 ? round(($rewardsUsed / $rewardsGenerated) * 100) : 0,
                'active_subscriptions_count' => ClientSubscription::where('status', ClientSubscription::STATUS_ACTIVE)->count(),
                'subscriptions_sold' => $subscriptionsSold,
                'subscriptions_revenue' => $subscriptionsRevenue,
                'subscriptions_expiring_soon' => ClientSubscription::where('status', ClientSubscription::STATUS_ACTIVE)
                    ->whereDate('ends_on', '<=', now()->addDays(7))
                    ->count(),
            ],
            'charts' => [
                'registrations' => $this->dailySeries(Client::query()->whereNotNull('registered_at'), 'registered_at', $from, $to),
                'rewards_generated' => $this->dailySeries(LoyaltyReward::query(), 'generated_at', $from, $to),
                'rewards_used' => $this->dailySeries(LoyaltyReward::query()->where('status', LoyaltyReward::STATUS_USED), 'used_at', $from, $to),
                'subscriptions_sold' => $this->dailySeries(ClientSubscription::query(), 'purchased_at', $from, $to),
            ],
        ]]);
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function resolvePeriod(array $validated): array
    {
        $period = $validated['period'] ?? '30d';

        return match ($period) {
            '7d' => [now()->subDays(6)->startOfDay(), now()->endOfDay()],
            'month' => [now()->startOfMonth(), now()->endOfMonth()],
            'custom' => [
                isset($validated['from']) ? Carbon::parse($validated['from'])->startOfDay() : now()->subDays(29)->startOfDay(),
                isset($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : now()->endOfDay(),
            ],
            default => [now()->subDays(29)->startOfDay(), now()->endOfDay()],
        };
    }

    /** @return array<int, array{date: string, count: int}> */
    private function dailySeries($query, string $column, Carbon $from, Carbon $to): array
    {
        $rows = $query->selectRaw("DATE({$column}) as d, COUNT(*) as c")
            ->whereBetween($column, [$from, $to])
            ->groupBy('d')
            ->pluck('c', 'd');

        $series = [];
        $cursor = $from->copy()->startOfDay();
        while ($cursor->lte($to)) {
            $key = $cursor->toDateString();
            $series[] = ['date' => $key, 'count' => (int) ($rows[$key] ?? 0)];
            $cursor->addDay();
        }

        return $series;
    }
}
