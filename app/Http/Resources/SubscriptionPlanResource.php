<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SubscriptionPlanResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'price' => (float) $this->price,
            'duration_value' => $this->duration_value,
            'duration_unit' => $this->duration_unit,
            'is_active' => (bool) $this->is_active,
            'allow_suspension' => (bool) $this->allow_suspension,
            'allow_renewal' => (bool) $this->allow_renewal,
            'notes' => $this->notes,
            'allowed_days' => $this->allowed_days ?? [],
            'time_start' => $this->time_start,
            'time_end' => $this->time_end,
            'max_per_day' => $this->max_per_day,
            'max_per_week' => $this->max_per_week,
            'max_per_month' => $this->max_per_month,
            'min_interval_minutes' => $this->min_interval_minutes,
            'active_subscriptions_count' => $this->active_subscriptions_count !== null
                ? (int) $this->active_subscriptions_count
                : null,
            'services' => $this->whenLoaded('services', fn () => $this->services->map(fn ($planService) => [
                'id' => $planService->id,
                'service_id' => $planService->service_id,
                'service_name' => $planService->service?->name,
                'quota_period' => $planService->quota_period,
                'quota_per_period' => $planService->quota_per_period,
                'quota_total' => $planService->quota_total,
                'allow_rollover' => (bool) $planService->allow_rollover,
                'commission_basis' => $planService->commission_basis,
                'commission_value' => $planService->commission_value !== null ? (float) $planService->commission_value : null,
            ])),
        ];
    }
}
