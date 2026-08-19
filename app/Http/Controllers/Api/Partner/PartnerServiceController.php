<?php

namespace App\Http\Controllers\Api\Partner;

use App\Http\Controllers\Api\Partner\Concerns\RequiresActivePartner;
use App\Http\Controllers\Controller;
use App\Models\PartnerServiceCommission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Offres/services que BOGOSLAND autorise aux partenaires" (§8 step 2) — the
 * partner's own commission grid (configured by an admin in the Partenaires
 * screen) doubles as that allow-list: a service only shows up here once
 * BOGOSLAND has explicitly priced a commission for it for this partner.
 */
class PartnerServiceController extends Controller
{
    use RequiresActivePartner;

    public function index(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);

        $rules = PartnerServiceCommission::where('partner_id', $partner->id)
            ->with('service')
            ->get()
            ->filter(fn (PartnerServiceCommission $rule) => $rule->service !== null && $rule->service->is_active);

        return response()->json(['data' => $rules->map(fn (PartnerServiceCommission $rule) => [
            'service_id' => $rule->service->id,
            'name' => $rule->service->name,
            'category' => $rule->service->category,
            'duration_minutes' => $rule->service->duration_minutes,
            'price' => (float) $rule->service->price,
            'color' => $rule->service->color,
            'commission_type' => $rule->type,
            'commission_value' => (float) $rule->value,
            'commission_preview' => $partner->commissionFor($rule->service->id, (float) $rule->service->price),
        ])->sortBy('name')->values()]);
    }
}
