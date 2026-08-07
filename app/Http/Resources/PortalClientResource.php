<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PortalClientResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $account = $this->loyaltyAccount;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'birth_date' => $this->birth_date?->toDateString(),
            'gender' => $this->gender,
            'marketing_consent' => $this->consent_marketing_at !== null,
            'loyalty_number' => $account?->loyalty_number,
            'points_balance' => $account?->points_balance ?? 0,
            'registered_at' => $this->registered_at?->toDateString(),
        ];
    }
}
