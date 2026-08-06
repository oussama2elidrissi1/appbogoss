<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LoyaltyProgramResource extends JsonResource
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
            'type' => $this->type,
            'is_active' => (bool) $this->is_active,
            'config' => $this->config,
            'commission_basis' => $this->commission_basis,
            'commission_value' => $this->commission_value !== null ? (float) $this->commission_value : null,
            'starts_on' => $this->starts_on?->toDateString(),
            'ends_on' => $this->ends_on?->toDateString(),
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
