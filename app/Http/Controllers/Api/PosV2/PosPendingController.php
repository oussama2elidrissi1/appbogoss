<?php

namespace App\Http\Controllers\Api\PosV2;

use App\Http\Controllers\Controller;
use App\Http\Resources\PosV2\PosInvoiceResource;
use App\Models\Prestation;
use App\Services\PosV2\PosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Bridge from the V1 employee workflow: prestations sent to the caisse from
 * Mon Espace (status pending_payment) surface here so V2 can take them over
 * — either as their own invoice ("Reprendre") or merged into a client's
 * open invoice ("Ajouter à la facture"). V1's own queue keeps working for
 * whoever still uses it; a prestation taken over here leaves that queue
 * atomically, so it can never be charged twice.
 */
class PosPendingController extends Controller
{
    public function __construct(private readonly PosService $pos) {}

    public function index(): JsonResponse
    {
        $pending = $this->pos->pendingPrestationsQuery()->get();

        return response()->json(['data' => $pending->map(fn (Prestation $prestation) => [
            'id' => $prestation->id,
            'reference' => $prestation->reference,
            'client_id' => $prestation->client_id,
            'client_name' => $prestation->client?->name ?? $prestation->client_label ?? 'Client de passage',
            'employee_id' => $prestation->employee_id,
            'employee_name' => $prestation->employee?->name,
            'employee_avatar_color' => $prestation->employee?->avatar_color,
            'items_count' => $prestation->items->count(),
            'services_label' => $prestation->items->pluck('label')->join(' + '),
            'total' => (float) $prestation->total,
            'sent_at' => $prestation->validated_at?->toIso8601String(),
            'sent_time' => $prestation->validated_at?->format('H:i'),
        ])->values()]);
    }

    public function import(Request $request, Prestation $prestation): JsonResponse
    {
        $validated = $request->validate([
            'target_invoice_id' => ['nullable', 'integer', 'exists:prestations,id'],
        ]);

        $target = ! empty($validated['target_invoice_id'])
            ? Prestation::findOrFail($validated['target_invoice_id'])
            : null;

        $invoice = $this->pos->importPendingPrestation($prestation, $target, $request->user());

        return response()->json(['data' => new PosInvoiceResource($invoice)]);
    }
}
