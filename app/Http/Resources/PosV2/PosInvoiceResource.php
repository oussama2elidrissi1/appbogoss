<?php

namespace App\Http\Resources\PosV2;

use App\Models\Prestation;
use App\Models\Tip;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Prestation */
class PosInvoiceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        if (
            $this->resource->relationLoaded('items')
            && $this->channel !== Prestation::CHANNEL_CAISSE_V2
            && $this->resource->relationLoaded('employee')
        ) {
            $this->items->each(fn ($item) => $item->setRelation('prestation', $this->resource));
        }

        $lineDiscounts = $this->whenLoaded(
            'items',
            fn () => round((float) $this->items->sum(
                fn ($item) => min((float) ($item->discount_amount ?? 0), $item->lineTotal()),
            ), 2),
            0.0,
        );

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'status' => $this->status,
            'channel' => $this->channel,
            'held' => $this->held_at !== null,
            'held_at' => $this->held_at?->toIso8601String(),
            'work_day_id' => $this->work_day_id,
            'appointment_id' => $this->appointment_id,
            'client_id' => $this->client_id,
            'client_name' => $this->client?->name ?? $this->client_label,
            'client_phone' => $this->client?->phone,
            'client_avatar_color' => $this->client?->avatar_color,
            'is_walk_in' => $this->client_id === null,
            'employee_id' => $this->employee_id,
            'employee_name' => $this->whenLoaded('employee', fn () => $this->employee?->name),
            'subtotal' => (float) $this->subtotal,
            'line_discounts_total' => $lineDiscounts,
            'discount_amount' => $this->discount_amount !== null ? (float) $this->discount_amount : null,
            'discount_reason' => $this->discount_reason,
            'total' => (float) $this->total,
            'payment_method' => $this->payment_method,
            'payment_breakdown' => $this->payment_breakdown,
            'amount_received' => $this->amount_received !== null ? (float) $this->amount_received : null,
            'change_given' => $this->change_given !== null ? (float) $this->change_given : null,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toIso8601String(),
            'opened_time' => $this->created_at?->format('H:i'),
            'confirmed_at' => $this->confirmed_at?->toIso8601String(),
            'confirmed_by' => $this->whenLoaded('confirmedBy', fn () => $this->confirmedBy?->name),
            'created_by' => $this->whenLoaded('createdBy', fn () => $this->createdBy?->name),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'cancel_reason' => $this->cancel_reason,
            'refunded_at' => $this->refunded_at?->toIso8601String(),
            'refund_reason' => $this->refund_reason,
            'sale_id' => $this->sale_id,
            'sale_deleted' => $this->whenLoaded('sale', fn () => $this->sale_id !== null && $this->sale === null),
            'print_count' => (int) $this->print_count,
            'items_count' => $this->whenLoaded('items', fn () => $this->items->count()),
            'items' => PosInvoiceLineResource::collection($this->whenLoaded('items')),
            'employees' => $this->whenLoaded('items', function () {
                $employees = $this->items->map(fn ($item) => $item->employee)->filter();

                if ($employees->isEmpty() && $this->channel !== Prestation::CHANNEL_CAISSE_V2 && $this->employee !== null) {
                    $employees = collect([$this->employee]);
                }

                return $employees
                    ->unique('id')
                    ->map(fn ($employee) => [
                        'id' => $employee->id,
                        'name' => $employee->name,
                        'avatar_color' => $employee->avatar_color,
                    ])
                    ->values();
            }),
            'tips' => $this->whenLoaded('tips', fn () => $this->tips->map(fn (Tip $tip) => [
                'id' => $tip->id,
                'employee_id' => $tip->employee_id,
                'employee_name' => $tip->employee?->name,
                'prestation_item_id' => $tip->prestation_item_id,
                'amount' => (float) $tip->amount,
                'payment_method' => $tip->payment_method,
                'voided' => $tip->trashed(),
            ])->values()),
            'tips_total' => $this->whenLoaded('tips', fn () => round(
                (float) $this->tips->reject(fn (Tip $tip) => $tip->trashed())->sum('amount'),
                2,
            )),
            'commissions' => $this->whenLoaded('commissions', fn () => $this->commissions->map(fn ($commission) => [
                'id' => $commission->id,
                'prestation_item_id' => $commission->prestation_item_id,
                'employee_id' => $commission->employee_id,
                'employee_name' => $commission->employee?->name,
                'service_id' => $commission->service_id,
                'type' => $commission->type,
                'rate_or_amount' => (float) $commission->rate_or_amount,
                'base_amount' => (float) $commission->base_amount,
                'amount' => (float) $commission->amount,
                'status' => $commission->status,
            ])->values()),
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
