<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ClientResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'avatar_color' => $this->avatar_color,
            'loyalty_points' => (int) $this->loyalty_points,
            'notes' => $this->notes,
            'last_visit_at' => $this->last_visit_at,
            'sales_count' => (int) ($this->sales_count ?? 0),
            'appointments_count' => (int) ($this->appointments_count ?? 0),
        ];
    }
}
