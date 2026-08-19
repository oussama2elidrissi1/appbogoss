<?php

namespace App\Http\Controllers\Api\Partner;

use App\Http\Controllers\Api\Partner\Concerns\RequiresActivePartner;
use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Client;
use App\Models\PartnerCommission;
use App\Models\Service;
use App\Services\PartnerCommissionService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

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
            'reservations_today' => Appointment::where('partner_id', $partner->id)
                ->whereNotIn('status', ['cancelled', 'no_show', 'refused'])
                ->whereDate('starts_at', Carbon::today())
                ->count(),
            'reservations_month' => $reservationsMonth,
            'reservations_confirmed' => $reservationsConfirmed,
            'commission_estimated' => round($estimatedCommission, 2),
            'commission_validated' => round($ledgerSummary['validated_total'], 2),
            'commission_paid' => round($ledgerSummary['paid_total'], 2),
            'upcoming_reservations' => $this->upcomingReservations($partner->id),
            'recent_activity' => $this->recentActivity($partner->id),
        ]]);
    }

    /** §4 — the next 5 upcoming reservations, so the partner sees what's coming without opening the full list. */
    private function upcomingReservations(int $partnerId): array
    {
        $appointments = Appointment::where('partner_id', $partnerId)
            ->whereIn('status', ['pending', 'confirmed'])
            ->where('starts_at', '>=', now())
            ->with('client')
            ->orderBy('starts_at')
            ->limit(5)
            ->get();

        $serviceIds = $appointments
            ->flatMap(fn (Appointment $a) => collect($a->reservation_items ?: [['service_id' => $a->service_id]])->pluck('service_id'))
            ->filter()
            ->unique();
        $serviceNames = Service::whereIn('id', $serviceIds)->pluck('name', 'id');

        return $appointments->map(fn (Appointment $appointment) => [
            'id' => $appointment->id,
            'client_name' => $appointment->client?->name,
            'starts_at' => $appointment->starts_at?->toIso8601String(),
            'service_names' => collect($appointment->reservation_items ?: [['service_id' => $appointment->service_id]])
                ->pluck('service_id')
                ->unique()
                ->map(fn ($id) => $serviceNames->get($id))
                ->filter()
                ->values(),
            'participants_count' => count($appointment->people ?: [null]),
            'status' => $appointment->status,
        ])->values()->all();
    }

    /** §4 — a merged, real activity feed (reservations + clients + commissions), not a fabricated log. */
    private function recentActivity(int $partnerId): array
    {
        $statusEvents = AppointmentStatusLog::whereHas('appointment', fn ($q) => $q->where('partner_id', $partnerId))
            ->with('appointment')
            ->latest('created_at')
            ->limit(8)
            ->get()
            ->map(fn (AppointmentStatusLog $log) => [
                'type' => 'appointment_status',
                'label' => $this->statusEventLabel($log),
                'created_at' => $log->created_at?->toIso8601String(),
            ]);

        $clientEvents = Client::where('partner_id', $partnerId)
            ->latest('created_at')
            ->limit(5)
            ->get(['name', 'created_at'])
            ->map(fn (Client $client) => [
                'type' => 'client_created',
                'label' => sprintf('%s ajouté(e) comme client', $client->name),
                'created_at' => $client->created_at?->toIso8601String(),
            ]);

        $commissionEvents = PartnerCommission::where('partner_id', $partnerId)
            ->where('status', PartnerCommission::STATUS_VALIDATED)
            ->latest('created_at')
            ->limit(5)
            ->get(['amount', 'created_at'])
            ->map(fn (PartnerCommission $commission) => [
                'type' => 'commission_validated',
                'label' => sprintf('Commission de %s MAD validée', number_format((float) $commission->amount, 2)),
                'created_at' => $commission->created_at?->toIso8601String(),
            ]);

        return (new Collection([...$statusEvents, ...$clientEvents, ...$commissionEvents]))
            ->filter(fn (array $event) => $event['created_at'] !== null)
            ->sortByDesc('created_at')
            ->take(6)
            ->values()
            ->all();
    }

    private function statusEventLabel(AppointmentStatusLog $log): string
    {
        $reference = 'RSV-'.$log->appointment_id;

        return match (true) {
            $log->from_status === null => sprintf('Réservation %s créée', $reference),
            $log->to_status === 'confirmed' => sprintf('Réservation %s confirmée', $reference),
            $log->to_status === 'refused' => sprintf('Réservation %s refusée', $reference),
            $log->to_status === 'cancelled' => sprintf('Réservation %s annulée', $reference),
            $log->to_status === 'completed' => sprintf('Réservation %s terminée', $reference),
            default => sprintf('Réservation %s mise à jour', $reference),
        };
    }
}
