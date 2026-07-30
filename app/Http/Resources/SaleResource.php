<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
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
            'category' => $this->category,
            'total' => (float) $this->total,
            'commission_amount' => $this->commission_amount !== null ? (float) $this->commission_amount : null,
            'payment_method' => $this->payment_method,
            'print_count' => (int) $this->print_count,
            'printed_ticket_count' => (int) $this->print_count * 2,
            'created_at' => $this->created_at,
            'deleted_at' => $this->deleted_at,
            'is_deleted' => $this->trashed(),
            'client' => $this->client ? [
                'id' => $this->client->id,
                'name' => $this->client->name,
            ] : null,
            'client_label' => $this->client_label,
            'employee' => $this->employee ? [
                'id' => $this->employee->id,
                'name' => $this->employee->name,
                'avatar_color' => $this->employee->avatar_color,
            ] : null,
            'items' => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'label' => $item->label,
                'quantity' => $item->quantity,
                'unit_price' => (float) $item->unit_price,
            ])->all(),
        ];
    }
}
