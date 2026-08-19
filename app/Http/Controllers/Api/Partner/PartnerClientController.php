<?php

namespace App\Http\Controllers\Api\Partner;

use App\Http\Controllers\Api\Partner\Concerns\RequiresActivePartner;
use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Client;
use App\Models\PartnerCommission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Read side of "Mes clients" (§13/§14) — creating/editing a client itself
 * still goes through the already partner-scoped POST/PATCH /api/clients
 * (ClientController + ClientPolicy); this controller only adds the
 * per-client activity aggregates (CA généré, commission générée…) that the
 * generic ClientResource deliberately doesn't compute, to keep the shared
 * staff client list light.
 */
class PartnerClientController extends Controller
{
    use RequiresActivePartner;

    public function index(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);
        $validated = $request->validate(['search' => ['nullable', 'string', 'max:255']]);

        $query = Client::where('partner_id', $partner->id)->orderBy('name');
        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($sub) use ($search): void {
                $sub->where('name', 'like', '%'.$search.'%')
                    ->orWhere('email', 'like', '%'.$search.'%')
                    ->orWhere('phone', 'like', '%'.$search.'%');
            });
        }
        $clients = $query->get();

        $stats = $this->activityStats($partner->id, $clients->pluck('id')->all());

        return response()->json(['data' => $clients->map(fn (Client $client) => $this->clientRow($client, $stats[$client->id] ?? null))->values()]);
    }

    public function show(Request $request, Client $client): JsonResponse
    {
        $partner = $this->currentPartner($request);
        abort_unless($client->partner_id === $partner->id, 403, 'Ce client n’appartient pas à votre portefeuille.');

        $stats = $this->activityStats($partner->id, [$client->id]);

        $reservations = Appointment::where('partner_id', $partner->id)
            ->where(function ($query) use ($client) {
                $query->where('client_id', $client->id)
                    ->orWhereJsonContains('client_ids', $client->id);
            })
            ->with('service')
            ->orderByDesc('starts_at')
            ->get()
            ->map(fn (Appointment $appointment) => [
                'id' => $appointment->id,
                'starts_at' => $appointment->starts_at?->toIso8601String(),
                'status' => $appointment->status,
                'service_name' => $appointment->service?->name,
            ]);

        return response()->json(['data' => array_merge(
            $this->clientRow($client, $stats[$client->id] ?? null),
            ['reservations' => $reservations],
        )]);
    }

    /**
     * @param  array<int>  $clientIds
     * @return array<int, array{reservations: int, revenue: float, commission: float, last_visit: ?string}>
     */
    private function activityStats(int $partnerId, array $clientIds): array
    {
        if (empty($clientIds)) {
            return [];
        }

        $reservationCounts = Appointment::where('partner_id', $partnerId)
            ->whereIn('client_id', $clientIds)
            ->select('client_id', DB::raw('count(*) as total'), DB::raw('max(starts_at) as last_starts_at'))
            ->groupBy('client_id')
            ->get()
            ->keyBy('client_id');

        $commissionRows = PartnerCommission::where('partner_id', $partnerId)
            ->whereIn('client_id', $clientIds)
            ->where('status', '!=', PartnerCommission::STATUS_CANCELLED)
            ->select('client_id', DB::raw('sum(base_amount) as revenue'), DB::raw('sum(amount) as commission'))
            ->groupBy('client_id')
            ->get()
            ->keyBy('client_id');

        $stats = [];
        foreach ($clientIds as $id) {
            $stats[$id] = [
                'reservations' => (int) ($reservationCounts[$id]->total ?? 0),
                'last_visit' => $reservationCounts[$id]->last_starts_at ?? null,
                'revenue' => (float) ($commissionRows[$id]->revenue ?? 0),
                'commission' => (float) ($commissionRows[$id]->commission ?? 0),
            ];
        }

        return $stats;
    }

    /** @return array<string, mixed> */
    private function clientRow(Client $client, ?array $stats): array
    {
        return [
            'id' => $client->id,
            'name' => $client->name,
            'phone' => $client->phone,
            'email' => $client->email,
            'avatar_color' => $client->avatar_color,
            'created_at' => $client->created_at?->toIso8601String(),
            'reservations_count' => $stats['reservations'] ?? 0,
            'last_reservation_at' => $stats['last_visit'] ?? null,
            'revenue_generated' => round($stats['revenue'] ?? 0, 2),
            'commission_generated' => round($stats['commission'] ?? 0, 2),
        ];
    }
}
