<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'is_active' => (bool) $this->is_active,
            'roles' => $this->getRoleNames()->all(),
            'permissions' => $this->getAllPermissions()->pluck('name')->all(),
            'employee_id' => $this->employee?->id,
            'employee_name' => $this->employee?->name,
            'partner_id' => $this->partner?->id,
            'partner_name' => $this->partner?->name,
            'employee_service_categories' => $this->employee?->service_categories ?? [],
            'employee_allowed_service_ids' => $this->employee?->allowed_service_ids ?? [],
        ];
    }
}
