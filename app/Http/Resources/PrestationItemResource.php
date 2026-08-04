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
        ];
    }
}
