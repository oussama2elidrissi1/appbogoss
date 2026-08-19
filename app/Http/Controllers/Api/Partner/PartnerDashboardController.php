<?php

namespace App\Http\Controllers\Api\Partner;

use App\Http\Controllers\Api\Partner\Concerns\RequiresActivePartner;
use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Services\PartnerCommissionService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * KPIs for the partner portal home screen — every figure is a live query,
 * never a hardcoded/placeholder number (§27).
 */
class PartnerDashboardController extends Controller
{
    use RequiresActivePartner;

    public function __construct(private readonly PartnerCommissionService $commissionService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);
        $monthStart = Carbon::now()->startOfMonth();
        $monthEnd = Carbon::now()->endOfMonth();

        $monthAppointments = Appointment::where('partner_id', $partner->id)
            ->whereBetween('starts_at', [$monthStart, $monthEnd])
            ->get(['id', 'status']);

        $reservationsMonth = $monthAppointments->whereNotIn('status', ['cancelled', 'no_show'])->count();
        $reservationsConfirmed = $monthAppointments->where('status', 'confirmed')->count();

        $estimatedCommission = $this->commissionService->estimatedTotal($partner, $monthStart, $monthEnd);
        $ledgerSummary = $this->commissionService->summary($partner);

        return response()->json(['data' => [
            'partner_name' => $partner->name,
            'status' => $partner->status,
            'reservations_month' => $reservationsMonth,
            'reservations_confirmed' => $reservationsConfirmed,
            'commission_estimated' => round($estimatedCommission, 2),
            'commission_validated' => round($ledgerSummary['validated_total'], 2),
            'commission_paid' => round($ledgerSummary['paid_total'], 2),
        ]]);
    }
}
