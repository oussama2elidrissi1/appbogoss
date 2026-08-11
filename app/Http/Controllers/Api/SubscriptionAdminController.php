<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClientSubscription;
use App\Models\ClientSubscriptionUsage;
use App\Models\Sale;
use App\Models\SubscriptionPlan;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin surface for sold subscriptions: list/filter, visit history, KPI
 * dashboard, cancellation and QR regeneration. Lifecycle actions
 * (suspend/resume/extend/renew) stay in ClientSubscriptionLifecycleController.
 */
class SubscriptionAdminController extends Controller
{
    public function __construct(private readonly SubscriptionService $subscriptionService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['active', 'expired', 'cancelled', 'suspended'])],
            'plan_id' => ['nullable', 'integer', Rule::exists('subscription_plans', 'id')],
            'client_id' => ['nullable', 'integer', Rule::exists('clients', 'id')],
            'search' => ['nullable', 'string', 'max:255'],
            'expiring_within' => ['nullable', 'integer', 'min:1', 'max:60'],
        ]);

        $query = ClientSubscription::query()
            ->with(['client', 'plan.services.service', 'sale'])
            ->withCount(['usages as used_visits_count' => fn ($q) => $q->whereIn('status', ['reserved', 'confirmed'])])
            ->orderByDesc('purchased_at');

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }
        if (! empty($validated['plan_id'])) {
            $query->where('subscription_plan_id', $validated['plan_id']);
        }
        if (! empty($validated['client_id'])) {
            $query->where('client_id', $validated['client_id']);
        }
        if (! empty($validated['expiring_within'])) {
            $query->where('status', ClientSubscription::STATUS_ACTIVE)
                ->whereDate('ends_on', '>=', now())
                ->whereDate('ends_on', '<=', now()->addDays((int) $validated['expiring_within']));
        }
        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->whereHas('client', function ($clientQuery) use ($search): void {
                $clientQuery->where('name', 'like', '%'.$search.'%')
                    ->orWhere('phone', 'like', '%'.$search.'%');
            });
        }

        $subscriptions = $query->limit(300)->get()->map(fn (ClientSubscription $subscription) => $this->row($subscription));

        return response()->json(['data' => $subscriptions]);
    }

    public function usages(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'status' => ['nullable', Rule::in(['reserved', 'confirmed', 'voided'])],
            'plan_id' => ['nullable', 'integer'],
            'service_id' => ['nullable', 'integer'],
            'employee_id' => ['nullable', 'integer'],
            'subscription_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $query = ClientSubscriptionUsage::query()
            ->with(['subscription.client', 'subscription.plan', 'planService.service', 'employee', 'validatedBy'])
            ->orderByDesc('used_at')
            ->orderByDesc('id');

        if (! empty($validated['from'])) {
            $query->whereDate('used_on', '>=', $validated['from']);
        }
        if (! empty($validated['to'])) {
            $query->whereDate('used_on', '<=', $validated['to']);
        }
        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }
        if (! empty($validated['subscription_id'])) {
            $query->where('client_subscription_id', $validated['subscription_id']);
        }
        if (! empty($validated['plan_id'])) {
            $query->whereHas('subscription', fn ($q) => $q->where('subscription_plan_id', $validated['plan_id']));
        }
        if (! empty($validated['service_id'])) {
            $query->whereHas('planService', fn ($q) => $q->where('service_id', $validated['service_id']));
        }
        if (! empty($validated['employee_id'])) {
            $query->where('employee_id', $validated['employee_id']);
        }
        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->whereHas('subscription.client', function ($clientQuery) use ($search): void {
                $clientQuery->where('name', 'like', '%'.$search.'%')
                    ->orWhere('phone', 'like', '%'.$search.'%');
            });
        }

        $rows = $query->limit(400)->get()->map(fn (ClientSubscriptionUsage $usage) => [
            'id' => $usage->id,
            'used_at' => $usage->used_at?->toIso8601String(),
            'used_on' => $usage->used_on?->toDateString(),
            'client_name' => $usage->subscription?->client?->name,
            'plan_name' => $usage->subscription?->plan?->name,
            'service_name' => $usage->planService?->service?->name,
            'employee_name' => $usage->employee?->name,
            'validated_by' => $usage->validatedBy?->name,
            'status' => $usage->status,
            'channel' => $usage->channel,
            'exception_override' => (bool) $usage->exception_override,
        ]);

        return response()->json(['data' => $rows]);
    }

    public function dashboard(): JsonResponse
    {
        $monthStart = now()->startOfMonth();

        $soldThisMonth = ClientSubscription::where('purchased_at', '>=', $monthStart)->count();
        $revenueThisMonth = (float) Sale::query()
            ->whereIn('id', ClientSubscription::where('purchased_at', '>=', $monthStart)->whereNotNull('sale_id')->pluck('sale_id'))
            ->sum('total');

        $activeCount = ClientSubscription::where('status', ClientSubscription::STATUS_ACTIVE)->count();

        $expiringSoon = ClientSubscription::where('status', ClientSubscription::STATUS_ACTIVE)
            ->whereDate('ends_on', '>=', now())
            ->whereDate('ends_on', '<=', now()->addDays(7))
            ->with(['client', 'plan'])
            ->orderBy('ends_on')
            ->limit(10)
            ->get()
            ->map(fn (ClientSubscription $subscription) => [
                'id' => $subscription->id,
                'client_name' => $subscription->client?->name,
                'plan_name' => $subscription->plan?->name,
                'ends_on' => $subscription->ends_on->toDateString(),
            ]);

        $usageBase = ClientSubscriptionUsage::whereIn('status', ['reserved', 'confirmed']);
        $visitsToday = (clone $usageBase)->whereDate('used_on', now()->toDateString())->count();
        $visitsThisMonth = (clone $usageBase)->whereDate('used_on', '>=', $monthStart->toDateString())->count();

        $topPlans = ClientSubscription::where('status', ClientSubscription::STATUS_ACTIVE)
            ->selectRaw('subscription_plan_id, COUNT(*) as total')
            ->groupBy('subscription_plan_id')
            ->orderByDesc('total')
            ->limit(5)
            ->get()
            ->map(fn ($row) => [
                'plan_name' => SubscriptionPlan::find($row->subscription_plan_id)?->name ?? '—',
                'count' => (int) $row->total,
            ]);

        $topServices = ClientSubscriptionUsage::whereIn('client_subscription_usages.status', ['reserved', 'confirmed'])
            ->whereDate('used_on', '>=', $monthStart->toDateString())
            ->join('subscription_plan_services', 'subscription_plan_services.id', '=', 'client_subscription_usages.subscription_plan_service_id')
            ->join('services', 'services.id', '=', 'subscription_plan_services.service_id')
            ->selectRaw('services.name as service_name, COUNT(*) as total')
            ->groupBy('services.name')
            ->orderByDesc('total')
            ->limit(5)
            ->get()
            ->map(fn ($row) => ['service_name' => $row->service_name, 'count' => (int) $row->total]);

        return response()->json(['data' => [
            'active_count' => $activeCount,
            'sold_this_month' => $soldThisMonth,
            'revenue_this_month' => $revenueThisMonth,
            'expiring_soon_count' => $expiringSoon->count(),
            'expiring_soon' => $expiringSoon,
            'visits_today' => $visitsToday,
            'visits_this_month' => $visitsThisMonth,
            'top_plans' => $topPlans,
            'top_services' => $topServices,
        ]]);
    }

    public function cancel(Request $request, ClientSubscription $clientSubscription): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $subscription = $this->subscriptionService->cancel($clientSubscription, $validated['reason'] ?? null, $request->user());

        return response()->json(['data' => $this->row($subscription->load(['client', 'plan.services.service']))]);
    }

    public function regenerateQr(Request $request, ClientSubscription $clientSubscription): JsonResponse
    {
        $subscription = $this->subscriptionService->regenerateQrToken($clientSubscription, $request->user());

        return response()->json(['data' => $this->row($subscription->load(['client', 'plan.services.service']))]);
    }

    /**
     * @return array<string, mixed>
     */
    private function row(ClientSubscription $subscription): array
    {
        $quotaTotals = $subscription->plan?->services->pluck('quota_total');
        $totalVisits = $quotaTotals !== null && $quotaTotals->isNotEmpty() && ! $quotaTotals->contains(null)
            ? (int) $quotaTotals->sum()
            : null;

        $usedVisits = $subscription->used_visits_count
            ?? $subscription->usages()->whereIn('status', ['reserved', 'confirmed'])->count();

        return [
            'id' => $subscription->id,
            'status' => $subscription->status,
            'client' => [
                'id' => $subscription->client?->id,
                'name' => $subscription->client?->name ?? 'Client',
                'phone' => $subscription->client?->phone,
            ],
            'plan' => [
                'id' => $subscription->plan?->id,
                'name' => $subscription->plan?->name ?? 'Abonnement',
                'price' => (float) ($subscription->plan?->price ?? 0),
                'allow_suspension' => (bool) ($subscription->plan?->allow_suspension),
                'allow_renewal' => (bool) ($subscription->plan?->allow_renewal),
            ],
            'price_paid' => (float) ($subscription->sale?->total ?? $subscription->plan?->price ?? 0),
            'purchased_at' => $subscription->purchased_at?->toIso8601String(),
            'starts_on' => $subscription->starts_on->toDateString(),
            'ends_on' => $subscription->ends_on->toDateString(),
            'suspension_starts_on' => $subscription->suspension_starts_on?->toDateString(),
            'suspension_ends_on' => $subscription->suspension_ends_on?->toDateString(),
            'cancel_reason' => $subscription->cancel_reason,
            'renewed_from_id' => $subscription->renewed_from_id,
            'qr_token' => $subscription->qr_token,
            'used_visits' => (int) $usedVisits,
            'total_visits' => $totalVisits,
            'services' => ($subscription->plan?->services ?? collect())->map(fn ($planService) => [
                'plan_service_id' => $planService->id,
                'service_name' => $planService->service?->name ?? 'Service',
                'quota_period' => $planService->quota_period,
                'quota_per_period' => $planService->quota_per_period,
                'quota_total' => $planService->quota_total,
            ])->values()->all(),
        ];
    }
}
