<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdvanceResource extends JsonResource
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
            'employee_id' => $this->employee_id,
            'employee_name' => $this->employee->name ?? null,
            'work_day_id' => $this->work_day_id,
            'amount' => (float) $this->amount,
            'reason' => $this->reason,
            'given_on' => $this->given_on?->toDateString(),
            'settled_at' => $this->settled_at,
        ];
    }
}
