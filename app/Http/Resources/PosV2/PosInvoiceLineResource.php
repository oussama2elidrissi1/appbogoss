<?php

namespace App\Http\Resources\PosV2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\PrestationItem */
class PosInvoiceLineResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'service_id' => $this->service_id,
            'service_name' => $this->service?->name,
            'category' => $this->service?->category,
            'label' => $this->label,
            'quantity' => (int) $this->quantity,
            'unit_price' => (float) $this->unit_price,
            'discount_amount' => $this->discount_amount !== null ? (float) $this->discount_amount : null,
            'discount_reason' => $this->discount_reason,
            'line_total' => $this->lineTotal(),
            'effective_line_total' => $this->effectiveLineTotal(),
            'employee_id' => $this->employee_id,
            'employee_name' => $this->employee?->name,
            'employee_avatar_color' => $this->employee?->avatar_color,
            'beneficiary_name' => $this->beneficiary_name,
            'duration_minutes' => $this->duration_minutes,
            'notes' => $this->notes,
            'is_free' => (bool) $this->is_free,
            'public_price' => $this->public_price !== null ? (float) $this->public_price : null,
            'client_subscription_id' => $this->client_subscription_id,
            'loyalty_reward_id' => $this->loyalty_reward_id,
            'commission_amount' => $this->commission_amount !== null ? (float) $this->commission_amount : null,
        ];
    }
}
