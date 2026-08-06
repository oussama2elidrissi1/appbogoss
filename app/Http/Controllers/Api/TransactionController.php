<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTransactionRequest;
use App\Http\Resources\SaleResource;
use App\Models\Sale;
use App\Models\Product;
use App\Models\Employee;
use App\Models\SaleItem;
use App\Models\Service;
use App\Services\CommissionResolver;
use App\Services\WorkDayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;

class TransactionController extends Controller
{
    public function store(StoreTransactionRequest $request, WorkDayService $service, CommissionResolver $commissionResolver): JsonResponse
    {
        $activeDay = $service->getActiveDay();

        if ($activeDay === null) {
            return response()->json([
                'message' => "Aucune journée ouverte. Ouvrez la journée avant d'encaisser.",
            ], 422);
        }

        $data = $request->validated();

        if (empty($data['product_id']) && empty($data['employee_id'])) {
            throw ValidationException::withMessages(['employee_id' => 'Sélectionnez un employé pour cette prestation.']);
        }

        $sale = DB::transaction(function () use ($data, $activeDay, $request, $commissionResolver) {
            $product = null;
            $employeeId = $data['employee_id'] ?? null;
            $label = $data['label'];
            $price = (float) $data['price'];
            $serviceId = $data['service_id'] ?? null;
            $commissionAmount = $data['commission_amount'] ?? null;

            if (! empty($data['product_id'])) {
                $product = Product::query()->lockForUpdate()->find($data['product_id']);

                if ($product === null) {
                    throw ValidationException::withMessages(['product_id' => 'Ce produit n’existe plus.']);
                }

                $expectedArea = $data['category'] === 'boisson' ? 'refrigerateur' : 'vitrine';
                $companyOwner = Employee::query()
                    ->where('is_company', true)
                    ->where('company_area', $expectedArea)
                    ->first();
                if ($companyOwner === null) {
                    throw ValidationException::withMessages(['product_id' => 'L’espace société n’est pas configuré.']);
                }
                $employeeId = $companyOwner->id;
                if (($product->stock_area ?: 'vitrine') !== $expectedArea) {
                    throw ValidationException::withMessages(['product_id' => 'Ce produit n’est pas disponible dans cet espace de stock.']);
                }

                if ($product->stock_quantity < 1) {
                    throw ValidationException::withMessages(['product_id' => 'Ce produit est en rupture de stock.']);
                }

                $label = $product->name;
                $price = (float) $product->price;
                $serviceId = null;
                $product->decrement('stock_quantity');
            } elseif (! $request->filled('commission_amount')) {
                // Left blank — auto-calculate the same way the Prestation
                // workflow does (per-service rule, falling back to the
                // employee's flat default rate) instead of silently storing
                // nothing. An explicitly typed value (including 0) still
                // wins, for the rare case of a manual override.
                $employee = Employee::find($employeeId);
                $employeeService = $serviceId ? Service::find($serviceId) : null;

                if ($employee !== null) {
                    $commissionAmount = $commissionResolver->resolve($employee, $employeeService, $price)['amount'];
                }
            }

            $sale = Sale::create([
                'work_day_id' => $activeDay->id,
                'client_id' => $data['client_id'] ?? null,
                'client_label' => $data['client_label'] ?? null,
                'employee_id' => $employeeId,
                'category' => $data['category'],
                'service_id' => $serviceId,
                'total' => $price,
                'commission_amount' => $commissionAmount,
                'payment_method' => $data['payment_method'] ?? 'especes',
                'print_count' => 1,
            ]);

            SaleItem::create([
                'sale_id' => $sale->id,
                'itemable_type' => $product ? Product::class : null,
                'itemable_id' => $product?->id,
                'label' => $label,
                'quantity' => 1,
                'unit_price' => $price,
            ]);

            return $sale;
        });

        $sale->load(['client', 'employee', 'items']);

        return response()->json(['data' => new SaleResource($sale)], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'work_day_id' => ['required', 'integer', Rule::exists('work_days', 'id')],
        ]);

        $sales = Sale::withTrashed()
            ->with(['client', 'employee', 'items'])
            ->where('work_day_id', $validated['work_day_id'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['data' => SaleResource::collection($sales)]);
    }

    public function recordPrint(Sale $sale): JsonResponse
    {
        $sale->increment('print_count');
        $sale->refresh()->load(['client', 'employee', 'items']);

        return response()->json(['data' => new SaleResource($sale)]);
    }

    public function destroy(Sale $sale): JsonResponse
    {
        DB::transaction(function () use ($sale): void {
            if ($sale->trashed()) {
                return;
            }

            $sale->load('items');
            foreach ($sale->items as $item) {
                if ($item->itemable_type === Product::class && $item->itemable_id) {
                    Product::query()->whereKey($item->itemable_id)->increment('stock_quantity', $item->quantity);
                }
            }

            $sale->delete();
        });
        $sale->load(['client', 'employee', 'items']);

        return response()->json(['data' => new SaleResource($sale)]);
    }
}
