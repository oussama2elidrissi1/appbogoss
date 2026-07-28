<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AppointmentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'client_id' => $this->client_id,
            'employee_id' => $this->employee_id,
            'service_id' => $this->service_id,
            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'status' => $this->status,
            'notes' => $this->notes,
            'client' => $this->client ? [
                'id' => $this->client->id,
                'name' => $this->client->name,
                'phone' => $this->client->phone,
            ] : null,
            'employee' => $this->employee ? [
                'id' => $this->employee->id,
                'name' => $this->employee->name,
                'avatar_color' => $this->employee->avatar_color,
            ] : null,
            'service' => $this->service ? [
                'id' => $this->service->id,
                'name' => $this->service->name,
                'category' => $this->service->category,
                'duration_minutes' => $this->service->duration_minutes,
                'price' => (float) $this->service->price,
                'color' => $this->service->color,
            ] : null,
        ];
    }
}
