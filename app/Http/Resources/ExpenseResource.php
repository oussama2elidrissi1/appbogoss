<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExpenseResource extends JsonResource
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
            'work_day_id' => $this->work_day_id,
            'work_day_date' => $this->whenLoaded('workDay', fn () => $this->workDay?->date?->toDateString()),
            'label' => $this->label,
            'category' => $this->category,
            'amount' => (float) $this->amount,
            'spent_on' => $this->spent_on?->toDateString(),
        ];
    }
}
