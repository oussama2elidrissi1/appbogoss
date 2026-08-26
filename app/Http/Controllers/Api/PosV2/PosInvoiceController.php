<?php

namespace App\Http\Controllers\Api\PosV2;

use App\Http\Controllers\Controller;
use App\Http\Resources\PosV2\PosInvoiceResource;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Services\PosV2\PosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Caisse V2 invoices ("factures ouvertes"). The whole group sits behind
 * permission:caisse_v2.access; the finer money permissions
 * (discount/cancel/checkout/refund) are re-checked per action below,
 * mirroring how V1 layers prestations.confirm_payment on top of ownership.
 */
class PosInvoiceController extends Controller
{
    public function __construct(private readonly PosService $pos) {}

    /** Open invoices board (§21). */
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => PosInvoiceResource::collection($this->pos->openInvoicesQuery()->get()),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'client_label' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:500'],
            'items' => ['nullable', 'array', 'max:30'],
            ...$this->lineRules('items.*.'),
        ]);

        $this->assertLinePermissions($request, $validated['items'] ?? []);

        $invoice = $this->pos->open($validated, $request->user());

        return response()->json(['data' => new PosInvoiceResource($invoice)], 201);
    }

    public function show(Prestation $prestation): JsonResponse
    {
        $prestation->load([
            'employee', 'items.employee', 'items.service', 'items.product', 'client', 'confirmedBy', 'createdBy',
            'sale', 'statusLogs.user',
            'tips' => fn ($query) => $query->withTrashed()->with('employee'),
        ]);

        return response()->json(['data' => new PosInvoiceResource($prestation)]);
    }

    public function update(Request $request, Prestation $prestation): JsonResponse
    {
        $validated = $request->validate([
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'client_label' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:500'],
            'discount_amount' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:99999'],
            'discount_reason' => ['nullable', 'string', 'max:255'],
        ]);

        if (array_key_exists('discount_amount', $validated) && ! $request->user()->can('caisse_v2.discount')) {
            return response()->json(['message' => 'Vous n’êtes pas autorisé à appliquer une remise.'], 403);
        }

        $invoice = $this->pos->updateInvoice($prestation, $validated, $request->user());

        return response()->json(['data' => new PosInvoiceResource($invoice)]);
    }

    public function hold(Request $request, Prestation $prestation): JsonResponse
    {
        return response()->json(['data' => new PosInvoiceResource(
            $this->pos->hold($prestation, $request->user())->load(['items.employee', 'items.service', 'client']),
        )]);
    }

    public function resume(Request $request, Prestation $prestation): JsonResponse
    {
        return response()->json(['data' => new PosInvoiceResource(
            $this->pos->resume($prestation, $request->user())->load(['items.employee', 'items.service', 'client']),
        )]);
    }

    public function storeLine(Request $request, Prestation $prestation): JsonResponse
    {
        $validated = $request->validate($this->lineRules());

        $this->assertLinePermissions($request, [$validated]);

        $this->pos->addLine($prestation, $validated, $request->user());

        return response()->json([
            'data' => new PosInvoiceResource($prestation->fresh(['items.employee', 'items.service', 'client'])),
        ], 201);
    }

    public function updateLine(Request $request, Prestation $prestation, PrestationItem $item): JsonResponse
    {
        $validated = $request->validate([
            'quantity' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:99'],
            'unit_price' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:99999'],
            'employee_id' => ['sometimes', 'nullable', 'integer', 'exists:employees,id'],
            'beneficiary_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:500'],
            'discount_amount' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:99999'],
            'discount_reason' => ['nullable', 'string', 'max:255'],
        ]);

        if (array_key_exists('discount_amount', $validated) && ! $request->user()->can('caisse_v2.discount')) {
            return response()->json(['message' => 'Vous n’êtes pas autorisé à appliquer une remise.'], 403);
        }

        $this->pos->updateLine($prestation, $item, $validated, $request->user());

        return response()->json([
            'data' => new PosInvoiceResource($prestation->fresh(['items.employee', 'items.service', 'client'])),
        ]);
    }

    public function destroyLine(Request $request, Prestation $prestation, PrestationItem $item): JsonResponse
    {
        $this->pos->removeLine($prestation, $item, $request->user());

        return response()->json([
            'data' => new PosInvoiceResource($prestation->fresh(['items.employee', 'items.service', 'client'])),
        ]);
    }

    public function cancel(Request $request, Prestation $prestation): JsonResponse
    {
        if (! $request->user()->can('caisse_v2.cancel')) {
            return response()->json(['message' => 'Vous n’êtes pas autorisé à annuler une facture.'], 403);
        }

        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        $invoice = $this->pos->cancel($prestation, $validated['reason'] ?? null, $request->user());

        return response()->json(['data' => new PosInvoiceResource($invoice->load(['items.employee', 'items.service', 'client']))]);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    private function lineRules(string $prefix = ''): array
    {
        return [
            $prefix.'service_id' => ['nullable', 'integer', 'exists:services,id'],
            $prefix.'product_id' => ['nullable', 'integer', 'exists:products,id'],
            // Product lines get their label from the product server-side.
            $prefix.'label' => [$prefix === '' ? 'required_without_all:service_id,product_id' : 'nullable', 'nullable', 'string', 'max:255'],
            $prefix.'quantity' => ['nullable', 'integer', 'min:1', 'max:99'],
            $prefix.'unit_price' => ['nullable', 'numeric', 'min:0', 'max:99999'],
            $prefix.'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            $prefix.'beneficiary_name' => ['nullable', 'string', 'max:255'],
            $prefix.'duration_minutes' => ['nullable', 'integer', 'min:0'],
            $prefix.'notes' => ['nullable', 'string', 'max:500'],
            $prefix.'loyalty_reward_id' => ['nullable', 'integer', 'exists:loyalty_rewards,id'],
            $prefix.'client_subscription_id' => ['nullable', 'integer', 'exists:client_subscriptions,id'],
            $prefix.'subscription_plan_service_id' => ['nullable', 'integer', 'exists:subscription_plan_services,id'],
            $prefix.'exception_override' => ['nullable', 'boolean'],
            $prefix.'override_reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * Same layered checks as V1's PrestationController: redeeming needs
     * loyalty.redeem, quota overrides need loyalty.override_quota.
     *
     * @param  array<int, array<string, mixed>>  $items
     */
    private function assertLinePermissions(Request $request, array $items): void
    {
        foreach ($items as $item) {
            if ((! empty($item['loyalty_reward_id']) || ! empty($item['client_subscription_id']))
                && ! $request->user()->can('loyalty.redeem')) {
                abort(403, 'Action non autorisée (fidélité/abonnement).');
            }
            if (! empty($item['exception_override']) && ! $request->user()->can('loyalty.override_quota')) {
                abort(403, 'Action non autorisée (dérogation de quota).');
            }
        }
    }
}
