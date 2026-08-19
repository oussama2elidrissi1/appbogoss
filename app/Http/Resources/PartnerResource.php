<?php

namespace App\Http\Resources;

use App\Models\PartnerServiceCommission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PartnerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'trade_name' => $this->trade_name,
            'contact_name' => $this->contact_name,
            'phone' => $this->phone,
            'email' => $this->email,
            'address' => $this->address,
            'city' => $this->city,
            'country' => $this->country,
            'logo_url' => $this->logo_url,
            'notes' => $this->notes,
            'is_active' => (bool) $this->is_active,
            'status' => $this->status,
            'login_email' => $this->user?->email,
            'user_id' => $this->user_id,
            'appointments_count' => $this->whenCounted('appointments'),
            'commissions' => $this->whenLoaded('commissions', fn () => $this->commissions->map(
                fn (PartnerServiceCommission $rule) => [
                    'id' => $rule->id,
                    'service_id' => $rule->service_id,
                    'service_name' => $rule->service?->name,
                    'service_category' => $rule->service?->category,
                    'service_price' => $rule->service ? (float) $rule->service->price : null,
                    'type' => $rule->type,
                    'value' => (float) $rule->value,
                ],
            )->values()->all()),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
