<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ClientSubscriptionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'client_id' => $this->client_id,
            'client_name' => $this->whenLoaded('client', fn () => $this->client?->name),
            'subscription_plan_id' => $this->subscription_plan_id,
            'plan_name' => $this->whenLoaded('plan', fn () => $this->plan?->name),
            'status' => $this->status,
            'purchased_at' => $this->purchased_at?->toIso8601String(),
            'starts_on' => $this->starts_on?->toDateString(),
            'ends_on' => $this->ends_on?->toDateString(),
            'sale_id' => $this->sale_id,
        ];
    }
}
