<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkDayResource extends JsonResource
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
            'date' => $this->date->toDateString(),
            'status' => $this->status,
            'opening_balance' => (float) $this->opening_balance,
            'closed_at' => $this->closed_at,
            'notes' => $this->notes,
            'opened_by' => $this->openedBy ? [
                'id' => $this->openedBy->id,
                'name' => $this->openedBy->name,
            ] : null,
            'employees' => $this->employees->map(fn ($employee) => [
                'id' => $employee->id,
                'name' => $employee->name,
                'avatar_color' => $employee->avatar_color,
                'role' => $employee->role,
                'present' => (bool) $employee->pivot->present,
            ])->all(),
            'closing_report' => $this->closing_report,
        ];
    }
}
