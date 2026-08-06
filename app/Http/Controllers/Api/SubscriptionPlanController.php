<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SubscriptionPlanResource;
use App\Models\SubscriptionPlan;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Admin CRUD scaffolding for subscription plans (no consuming UI yet — Phase
 * 3). `services[]` describes what's included, mirroring how
 * EmployeeServiceCommission rules are managed as their own normalized rows
 * rather than embedded JSON.
 */
class SubscriptionPlanController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function index(): JsonResponse
    {
        $plans = SubscriptionPlan::query()->with('services.service')->orderByDesc('created_at')->get();

        return response()->json(['data' => SubscriptionPlanResource::collection($plans)]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validated($request);

        $plan = DB::transaction(function () use ($validated) {
            $plan = SubscriptionPlan::create($validated['plan']);
            foreach ($validated['services'] as $service) {
                $plan->services()->create($service);
            }

            return $plan;
        });

        $this->activityLogger->log('subscription.plan_created', $plan, [], $validated['plan']);

        return response()->json(['data' => new SubscriptionPlanResource($plan->load('services.service'))], 201);
    }

    public function show(SubscriptionPlan $subscriptionPlan): JsonResponse
    {
        return response()->json(['data' => new SubscriptionPlanResource($subscriptionPlan->load('services.service'))]);
    }

    public function update(Request $request, SubscriptionPlan $subscriptionPlan): JsonResponse
    {
        $validated = $this->validated($request);
        $old = $subscriptionPlan->only(array_keys($validated['plan']));

        DB::transaction(function () use ($subscriptionPlan, $validated) {
            $subscriptionPlan->update($validated['plan']);
            $subscriptionPlan->services()->delete();
            foreach ($validated['services'] as $service) {
                $subscriptionPlan->services()->create($service);
            }
        });

        $this->activityLogger->log('subscription.plan_updated', $subscriptionPlan, $old, $validated['plan']);

        return response()->json(['data' => new SubscriptionPlanResource($subscriptionPlan->load('services.service'))]);
    }

    public function destroy(SubscriptionPlan $subscriptionPlan): JsonResponse
    {
        $subscriptionPlan->update(['is_active' => false]);

        $this->activityLogger->log('subscription.plan_deactivated', $subscriptionPlan);

        return response()->json(['data' => new SubscriptionPlanResource($subscriptionPlan)]);
    }

    /**
     * @return array{plan: array<string, mixed>, services: array<int, array<string, mixed>>}
     */
    private function validated(Request $request): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'price' => ['required', 'numeric', 'min:0'],
            'duration_value' => ['required', 'integer', 'min:1'],
            'duration_unit' => ['required', Rule::in(['days', 'weeks', 'months'])],
            'is_active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'services' => ['required', 'array', 'min:1'],
            'services.*.service_id' => ['required', 'integer', 'exists:services,id'],
            'services.*.quota_period' => ['nullable', Rule::in(['day', 'week', 'month'])],
            'services.*.quota_per_period' => ['nullable', 'integer', 'min:1'],
            'services.*.quota_total' => ['nullable', 'integer', 'min:1'],
            'services.*.allow_rollover' => ['nullable', 'boolean'],
            'services.*.commission_basis' => ['nullable', Rule::in(['none', 'public_price', 'fixed', 'percent', 'internal_value'])],
            'services.*.commission_value' => ['nullable', 'numeric', 'min:0'],
        ]);

        return [
            'plan' => collect($validated)->except('services')->all(),
            'services' => $validated['services'],
        ];
    }
}
