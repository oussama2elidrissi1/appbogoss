<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyProgramProgress;
use App\Models\LoyaltyReward;
use App\Models\Sale;
use App\Services\LoyaltySettingsService;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Mon BOGOSLAND" — read-only self-service views. The client can never
 * write to any of this: redemption/adjustment stays staff-only, exactly as
 * required (§7 "le client ne doit pas pouvoir valider lui-même une
 * consommation").
 */
class PortalLoyaltyController extends Controller
{
    public function __construct(
        private readonly SubscriptionService $subscriptionService,
        private readonly LoyaltySettingsService $settings,
    ) {
    }

    public function home(Request $request): JsonResponse
    {
        /** @var Client $client */
        $client = $request->user();
        $account = $client->loyaltyAccount;

        $rewards = LoyaltyReward::where('client_id', $client->id)
            ->where('status', LoyaltyReward::STATUS_AVAILABLE)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->with('program')
            ->get();

        $activeSubscriptions = ClientSubscription::where('client_id', $client->id)
            ->where('status', ClientSubscription::STATUS_ACTIVE)
            ->with('plan.services.service')
            ->get();

        $visitsCount = Sale::where('client_id', $client->id)->count();

        $nextReward = $this->closestProgramProgress($client);

        $expiryAlertDays = (int) $this->settings->get('subscription_expiry_alert_days', 7);
        $alerts = [];

        foreach ($rewards as $reward) {
            if ($reward->expires_at !== null && now()->diffInDays($reward->expires_at, false) <= 7 && now()->lt($reward->expires_at)) {
                $alerts[] = [
                    'type' => 'reward_expiring',
                    'message' => sprintf('Votre récompense "%s" expire bientôt.', $reward->program?->name ?? 'récompense'),
                ];
            }
        }
        foreach ($activeSubscriptions as $subscription) {
            if (now()->diffInDays($subscription->ends_on, false) <= $expiryAlertDays && now()->lte($subscription->ends_on)) {
                $alerts[] = [
                    'type' => 'subscription_expiring',
                    'message' => sprintf('Votre abonnement "%s" expire le %s.', $subscription->plan?->name, $subscription->ends_on->format('d/m/Y')),
                ];
            }
        }

        return response()->json(['data' => [
            'name' => $client->name,
            'points_balance' => $account?->points_balance ?? 0,
            'rewards_available' => $rewards->count(),
            'active_subscriptions' => $activeSubscriptions->count(),
            'visits_count' => $visitsCount,
            'next_reward' => $nextReward,
            'subscriptions' => $activeSubscriptions->map(fn (ClientSubscription $s) => $this->subscriptionSummary($s))->values(),
            'alerts' => $alerts,
        ]]);
    }

    public function programs(Request $request): JsonResponse
    {
        /** @var Client $client */
        $client = $request->user();

        $progressRows = LoyaltyProgramProgress::where('client_id', $client->id)
            ->whereHas('program', fn ($q) => $q->where('is_active', true))
            ->with('program')
            ->get();

        $data = $progressRows->map(function (LoyaltyProgramProgress $progress) {
            $program = $progress->program;

            return $this->programProgressPayload($program, $progress);
        })->filter()->values();

        return response()->json(['data' => $data]);
    }

    public function rewards(Request $request): JsonResponse
    {
        /** @var Client $client */
        $client = $request->user();

        $rewards = LoyaltyReward::where('client_id', $client->id)
            ->with(['program', 'service'])
            ->orderByDesc('generated_at')
            ->get()
            ->map(fn (LoyaltyReward $reward) => [
                'id' => $reward->id,
                'program_name' => $reward->program?->name,
                'type' => $reward->type,
                'service_name' => $reward->service?->name,
                'value' => $reward->value !== null ? (float) $reward->value : null,
                'status' => $reward->status,
                'generated_at' => $reward->generated_at?->toDateString(),
                'expires_at' => $reward->expires_at?->toDateString(),
                'used_at' => $reward->used_at?->toDateString(),
            ]);

        return response()->json(['data' => [
            'available' => $rewards->where('status', LoyaltyReward::STATUS_AVAILABLE)->values(),
            'used' => $rewards->where('status', LoyaltyReward::STATUS_USED)->values(),
            'expired' => $rewards->whereIn('status', [LoyaltyReward::STATUS_EXPIRED, LoyaltyReward::STATUS_CANCELLED])->values(),
        ]]);
    }

    public function subscriptions(Request $request): JsonResponse
    {
        /** @var Client $client */
        $client = $request->user();

        $subscriptions = ClientSubscription::where('client_id', $client->id)
            ->with('plan.services.service')
            ->orderByDesc('purchased_at')
            ->get()
            ->map(fn (ClientSubscription $s) => $this->subscriptionSummary($s));

        return response()->json(['data' => $subscriptions]);
    }

    private function subscriptionSummary(ClientSubscription $subscription): array
    {
        $services = $subscription->plan?->services->map(function ($planService) use ($subscription) {
            $quota = $subscription->status === ClientSubscription::STATUS_ACTIVE
                ? $this->subscriptionService->quotaRemaining($subscription, $planService)
                : ['period_remaining' => null, 'total_remaining' => null];

            return [
                'service_name' => $planService->service?->name,
                'quota_period' => $planService->quota_period,
                'quota_per_period' => $planService->quota_per_period,
                'period_remaining' => $quota['period_remaining'],
                'quota_total' => $planService->quota_total,
                'total_remaining' => $quota['total_remaining'],
            ];
        })->values() ?? [];

        $plan = $subscription->plan;

        $recentUsages = $subscription->usages()
            ->whereIn('status', ['reserved', 'confirmed'])
            ->with('planService.service')
            ->orderByDesc('used_at')
            ->orderByDesc('id')
            ->limit(10)
            ->get()
            ->map(fn ($usage) => [
                'used_at' => $usage->used_at?->toIso8601String() ?? $usage->used_on?->toIso8601String(),
                'service_name' => $usage->planService?->service?->name ?? 'Service',
                'status' => $usage->status,
            ])
            ->values();

        return [
            'id' => $subscription->id,
            'plan_name' => $plan?->name,
            'price' => $plan !== null ? (float) $plan->price : null,
            'status' => $subscription->status,
            'starts_on' => $subscription->starts_on?->toDateString(),
            'ends_on' => $subscription->ends_on?->toDateString(),
            'suspension_starts_on' => $subscription->suspension_starts_on?->toDateString(),
            'suspension_ends_on' => $subscription->suspension_ends_on?->toDateString(),
            'renewable' => (bool) ($plan?->allow_renewal ?? false),
            'services' => $services,
            // The personal QR only for a currently-active subscription — the
            // token is random and resolves server-side, never an id.
            'qr_token' => $subscription->status === ClientSubscription::STATUS_ACTIVE ? $subscription->qr_token : null,
            'allowed_days' => $plan?->allowed_days ?? [],
            'time_start' => $plan?->time_start,
            'time_end' => $plan?->time_end,
            'max_per_day' => $plan?->max_per_day,
            'max_per_week' => $plan?->max_per_week,
            'max_per_month' => $plan?->max_per_month,
            'min_interval_minutes' => $plan?->min_interval_minutes,
            'recent_usages' => $recentUsages,
        ];
    }

    private function closestProgramProgress(Client $client): ?array
    {
        $progressRows = LoyaltyProgramProgress::where('client_id', $client->id)
            ->whereHas('program', fn ($q) => $q->where('is_active', true)->whereIn('type', [
                LoyaltyProgram::TYPE_SERVICE_COUNT,
                LoyaltyProgram::TYPE_POINTS,
                LoyaltyProgram::TYPE_AMOUNT_SPENT,
                LoyaltyProgram::TYPE_VISIT_COUNT,
            ]))
            ->with('program')
            ->get();

        $best = null;
        $bestRatio = -1;

        foreach ($progressRows as $progress) {
            $payload = $this->programProgressPayload($progress->program, $progress);
            if ($payload === null || $payload['threshold'] === null || $payload['threshold'] <= 0) {
                continue;
            }
            $ratio = $payload['current'] / $payload['threshold'];
            if ($ratio > $bestRatio && $ratio < 1) {
                $bestRatio = $ratio;
                $best = $payload;
            }
        }

        return $best;
    }

    private function programProgressPayload(?LoyaltyProgram $program, LoyaltyProgramProgress $progress): ?array
    {
        if ($program === null) {
            return null;
        }

        $config = $program->config ?? [];
        $threshold = $config['threshold'] ?? null;

        $current = match ($program->type) {
            LoyaltyProgram::TYPE_POINTS => $progress->points_balance,
            LoyaltyProgram::TYPE_AMOUNT_SPENT => (float) $progress->amount_accumulated,
            default => $progress->counter,
        };

        return [
            'program_id' => $program->id,
            'name' => $program->name,
            'description' => $program->description,
            'type' => $program->type,
            'current' => $current,
            'threshold' => $threshold !== null ? (float) $threshold : null,
            'percent' => $threshold !== null && $threshold > 0 ? min(100, (int) round(($current / $threshold) * 100)) : null,
            'remaining' => $threshold !== null ? max(0, $threshold - $current) : null,
        ];
    }
}
