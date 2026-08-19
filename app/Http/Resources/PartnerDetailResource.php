<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The sensitive, single-partner view — payment/banking info (§16) and (for
 * admin) performance aggregates. Never used by a list endpoint: only the
 * admin fiche (PartnerController::show) and the partner's own profile
 * (PartnerProfileController) return this, so a RIB/IBAN never rides along
 * in the plain admin Partenaires list payload.
 */
class PartnerDetailResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return array_merge((new PartnerResource($this->resource))->toArray($request), [
            'legal_name' => $this->legal_name,
            'ice' => $this->ice,
            'payment_holder_name' => $this->payment_holder_name,
            'payment_bank_name' => $this->payment_bank_name,
            'payment_iban' => $this->payment_iban,
            'payment_method_preference' => $this->payment_method_preference,
            'created_at' => $this->created_at?->toIso8601String(),
        ]);
    }
}
