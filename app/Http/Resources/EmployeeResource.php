<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'role' => $this->role,
            'email' => $this->email,
            'phone' => $this->phone,
            'avatar_color' => $this->avatar_color,
            'specialties' => $this->specialties ?? [],
            'service_categories' => $this->service_categories ?? [],
            'allowed_service_ids' => $this->allowed_service_ids ?? [],
            'is_active' => (bool) $this->is_active,
            // Fiche du compte de validation Google Play : badge et nettoyage.
            'is_demo' => (bool) $this->is_demo,
            'default_commission_rate' => $this->default_commission_rate !== null
                ? (float) $this->default_commission_rate
                : null,
            'account' => $this->whenLoaded('user', fn () => $this->user === null ? null : [
                'user_id' => $this->user->id,
                'login_email' => $this->user->email,
                'system_role' => $this->user->getRoleNames()->first(),
                'is_account_active' => (bool) $this->user->is_active,
            ]),
        ];
    }
}
