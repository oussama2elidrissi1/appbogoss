<?php

namespace App\Http\Resources\PosV2;

use App\Models\Prestation;
use App\Services\CommissionResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\PrestationItem */
class PosInvoiceLineResource extends JsonResource
{
    /**
     * §20 — the backend is the single source of commission truth. Before
     * checkout this is a read-only PREVIEW through the same
     * CommissionResolver the checkout will use (nothing is persisted); after
     * checkout commission_amount carries the frozen value. Free lines
     * (abonnement/récompense) resolve their basis only at checkout, so no
     * estimate is shown for them.
     */
    private function estimatedCommission(): ?float
    {
        if ($this->commission_amount !== null || $this->is_free || $this->employee === null) {
            return null;
        }

        $resolved = app(CommissionResolver::class)->resolve(
            $this->employee,
            $this->service,
            $this->effectiveLineTotal(),
        );

        return $resolved['amount'] !== null ? (float) $resolved['amount'] : 0.0;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $category = $this->service?->category
            ?? ($this->product_id !== null
                ? ($this->product?->stock_area === 'refrigerateur' ? 'boisson' : 'vitrine')
                : null);
        $employee = $this->employee;

        if (
            $employee === null
            && $this->resource->relationLoaded('prestation')
            && $this->prestation?->channel !== Prestation::CHANNEL_CAISSE_V2
            && ! in_array($category, ['boisson', 'vente', 'vitrine'], true)
        ) {
            $employee = $this->prestation?->employee ?? $this->prestation?->sale?->employee;
        }

        return [
            'id' => $this->id,
            'service_id' => $this->service_id,
            'service_name' => $this->service?->name,
            'product_id' => $this->product_id,
            'category' => $category,
            'requires_employee' => $this->service_id !== null ? (bool) ($this->service?->requires_employee ?? true) : false,
            'label' => $this->label,
            'quantity' => (int) $this->quantity,
            'unit_price' => (float) $this->unit_price,
            'discount_amount' => $this->discount_amount !== null ? (float) $this->discount_amount : null,
            'discount_reason' => $this->discount_reason,
            'line_total' => $this->lineTotal(),
            'effective_line_total' => $this->effectiveLineTotal(),
            'employee_id' => $this->employee_id ?? $employee?->id,
            'employee_name' => $employee?->name,
            'employee_avatar_color' => $employee?->avatar_color,
            'beneficiary_name' => $this->beneficiary_name,
            'duration_minutes' => $this->duration_minutes,
            'notes' => $this->notes,
            'is_free' => (bool) $this->is_free,
            'public_price' => $this->public_price !== null ? (float) $this->public_price : null,
            'client_subscription_id' => $this->client_subscription_id,
            'loyalty_reward_id' => $this->loyalty_reward_id,
            'commission_amount' => $this->commission_amount !== null ? (float) $this->commission_amount : null,
            'estimated_commission' => $this->whenLoaded('employee', fn () => $this->estimatedCommission(), null),
        ];
    }
}
