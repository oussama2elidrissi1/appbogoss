<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PrestationItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'service_id' => $this->service_id,
            'label' => $this->label,
            'quantity' => (int) $this->quantity,
            'unit_price' => (float) $this->unit_price,
            'line_total' => $this->lineTotal(),
            'duration_minutes' => $this->duration_minutes,
            'notes' => $this->notes,
            'commission_type' => $this->commission_type,
            'commission_value' => $this->commission_value !== null ? (float) $this->commission_value : null,
            'commission_amount' => $this->commission_amount !== null ? (float) $this->commission_amount : null,
            'loyalty_reward_id' => $this->loyalty_reward_id,
            'client_subscription_id' => $this->client_subscription_id,
            'is_free' => (bool) $this->is_free,
            'public_price' => $this->public_price !== null ? (float) $this->public_price : null,
        ];
    }
}
