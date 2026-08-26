<?php

namespace App\Http\Controllers\Api\PosV2;

use App\Http\Controllers\Controller;
use App\Http\Resources\PosV2\PosInvoiceResource;
use App\Models\Prestation;
use App\Services\ActivityLogger;
use App\Services\PosV2\PosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PosCheckoutController extends Controller
{
    public function __construct(
        private readonly PosService $pos,
        private readonly ActivityLogger $activityLogger,
    ) {}

    /**
     * §25-§28 + §48 — the amounts in the payload are only ever hints/guards;
     * PosService recomputes everything server-side inside one transaction.
     */
    public function checkout(Request $request, Prestation $prestation): JsonResponse
    {
        if (! $request->user()->can('caisse_v2.checkout')) {
            return response()->json(['message' => 'Vous n’êtes pas autorisé à encaisser.'], 403);
        }

        $validated = $request->validate([
            'payment_method' => ['required', 'string', 'in:especes,carte,virement,mixte,autre'],
            'payment_breakdown' => ['nullable', 'array', 'max:4'],
            'payment_breakdown.*.method' => ['required_with:payment_breakdown', 'string', 'in:especes,carte,virement,autre'],
            'payment_breakdown.*.amount' => ['required_with:payment_breakdown', 'numeric', 'min:0.01'],
            'amount_received' => ['nullable', 'numeric', 'min:0'],
            'discount_amount' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:99999'],
            'discount_reason' => ['nullable', 'string', 'max:255'],
            'expected_total' => ['nullable', 'numeric', 'min:0'],
            'tips' => ['nullable', 'array', 'max:10'],
            'tips.*.employee_id' => ['required', 'integer', 'exists:employees,id'],
            'tips.*.amount' => ['required', 'numeric', 'min:0.01', 'max:99999'],
            'tips.*.prestation_item_id' => ['nullable', 'integer'],
            'tips.*.payment_method' => ['nullable', 'string', 'in:especes,carte,virement,autre'],
            'tips.*.notes' => ['nullable', 'string', 'max:255'],
        ]);

        if (array_key_exists('discount_amount', $validated) && ! $request->user()->can('caisse_v2.discount')) {
            return response()->json(['message' => 'Vous n’êtes pas autorisé à appliquer une remise.'], 403);
        }

        $invoice = $this->pos->checkout($prestation, $validated, $request->user());

        return response()->json(['data' => new PosInvoiceResource($invoice)]);
    }

    /** §32 — controlled correction of an already-paid invoice. */
    public function refund(Request $request, Prestation $prestation): JsonResponse
    {
        if (! $request->user()->can('caisse_v2.refund')) {
            return response()->json(['message' => 'Le remboursement est réservé aux comptes autorisés.'], 403);
        }

        $validated = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $invoice = $this->pos->refund($prestation, $validated['reason'], $request->user());

        return response()->json(['data' => new PosInvoiceResource(
            $invoice->load(['items.employee', 'items.service', 'client', 'sale']),
        )]);
    }

    /** Ticket print counter — mirrors V1's semantics on both tables. */
    public function print(Request $request, Prestation $prestation): JsonResponse
    {
        $prestation->increment('print_count');
        if ($prestation->sale !== null) {
            $prestation->sale->increment('print_count');
        }

        $this->activityLogger->log(
            $prestation->print_count > 1 ? 'prestation.reprint' : 'prestation.print',
            $prestation,
            [],
            ['print_count' => $prestation->print_count, 'channel' => 'caisse_v2'],
        );

        return response()->json(['data' => ['print_count' => (int) $prestation->print_count]]);
    }
}
