<?php

namespace App\Http\Controllers\Api\PosV2;

use App\Http\Controllers\Controller;
use App\Http\Resources\PosV2\PosInvoiceResource;
use App\Models\Appointment;
use App\Models\Prestation;
use App\Services\PosV2\PosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * §37 — the reservation -> caisse bridge. "today" lists what the front desk
 * can pull in; "open" creates (or returns) the invoice preloaded with the
 * reservation's lines, snapshots and per-line employees.
 */
class PosAppointmentController extends Controller
{
    public function __construct(private readonly PosService $pos) {}

    public function today(): JsonResponse
    {
        $appointments = Appointment::query()
            ->whereDate('starts_at', now()->toDateString())
            ->whereIn('status', ['pending', 'confirmed'])
            ->with(['client', 'service', 'employee'])
            ->orderBy('starts_at')
            ->get();

        $openedByAppointment = Prestation::where('channel', Prestation::CHANNEL_CAISSE_V2)
            ->whereIn('appointment_id', $appointments->pluck('id'))
            ->whereNotIn('status', [Prestation::STATUS_CANCELLED, Prestation::STATUS_REFUNDED])
            ->get(['id', 'appointment_id', 'status', 'reference'])
            ->keyBy('appointment_id');

        return response()->json(['data' => $appointments->map(function (Appointment $appointment) use ($openedByAppointment) {
            $items = collect($appointment->reservation_items ?: []);
            $opened = $openedByAppointment->get($appointment->id);

            return [
                'id' => $appointment->id,
                'client_id' => $appointment->client_id,
                'client_name' => $appointment->client?->name ?? 'Client',
                'client_phone' => $appointment->client?->phone,
                'starts_at' => $appointment->starts_at?->toIso8601String(),
                'time' => $appointment->starts_at?->format('H:i'),
                'status' => $appointment->status,
                'people_count' => max(1, count($appointment->people ?: [])),
                'services_count' => max(1, $items->count()),
                'services_label' => $items->isNotEmpty()
                    ? $items->pluck('service_id')->count().' service(s)'
                    : ($appointment->service?->name ?? 'Prestation'),
                'estimated_total' => round((float) $items->sum(fn (array $item) => (float) ($item['price_snapshot'] ?? 0)), 2),
                'invoice_id' => $opened?->id,
                'invoice_reference' => $opened?->reference,
                'invoice_status' => $opened?->status,
            ];
        })->values()]);
    }

    public function open(Request $request, Appointment $appointment): JsonResponse
    {
        $invoice = $this->pos->openFromAppointment($appointment, $request->user());

        return response()->json(['data' => new PosInvoiceResource($invoice)], 201);
    }
}
