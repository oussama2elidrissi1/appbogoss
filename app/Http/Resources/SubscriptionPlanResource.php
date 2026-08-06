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
            'notes' => $this->notes,
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
