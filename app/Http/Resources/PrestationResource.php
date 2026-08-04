<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PrestationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'status' => $this->status,
            'work_day_id' => $this->work_day_id,
            'client_id' => $this->client_id,
            'client_name' => $this->client?->name ?? $this->client_label,
            'client_phone' => $this->client?->phone,
            'employee_id' => $this->employee_id,
            'employee_name' => $this->employee?->name,
            'created_by_user_id' => $this->created_by_user_id,
            'subtotal' => (float) $this->subtotal,
            'discount_percent' => $this->discount_percent !== null ? (float) $this->discount_percent : null,
            'discount_amount' => $this->discount_amount !== null ? (float) $this->discount_amount : null,
            'total' => (float) $this->total,
            'payment_method' => $this->payment_method,
            'payment_breakdown' => $this->payment_breakdown,
            'amount_received' => $this->amount_received !== null ? (float) $this->amount_received : null,
            'change_given' => $this->change_given !== null ? (float) $this->change_given : null,
            'notes' => $this->notes,
            'validated_at' => $this->validated_at?->toIso8601String(),
            'confirmed_at' => $this->confirmed_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'cancel_reason' => $this->cancel_reason,
            'refunded_at' => $this->refunded_at?->toIso8601String(),
            'refund_reason' => $this->refund_reason,
            'sale_id' => $this->sale_id,
            'print_count' => (int) $this->print_count,
            'created_at' => $this->created_at?->toIso8601String(),
            'items' => PrestationItemResource::collection($this->whenLoaded('items')),
            'total_commission' => $this->whenLoaded(
                'items',
                fn () => round((float) $this->items->sum('commission_amount'), 2),
            ),
            'status_logs' => $this->whenLoaded('statusLogs', fn () => $this->statusLogs->map(fn ($log) => [
                'from_status' => $log->from_status,
                'to_status' => $log->to_status,
                'user_name' => $log->user?->name,
                'reason' => $log->reason,
                'created_at' => $log->created_at?->toIso8601String(),
            ])),
        ];
    }
}
