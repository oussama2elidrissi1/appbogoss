<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTransactionRequest;
use App\Http\Resources\SaleResource;
use App\Models\Sale;
use App\Models\Product;
use App\Models\SaleItem;
use App\Services\WorkDayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;

class TransactionController extends Controller
{
    public function store(StoreTransactionRequest $request, WorkDayService $service): JsonResponse
    {
        $activeDay = $service->getActiveDay();

        if ($activeDay === null) {
            return response()->json([
                'message' => "Aucune journée ouverte. Ouvrez la journée avant d'encaisser.",
            ], 422);
        }

        $data = $request->validated();

        $sale = DB::transaction(function () use ($data, $activeDay) {
            $product = null;
            $label = $data['label'];
            $price = (float) $data['price'];

            if (! empty($data['product_id'])) {
                $product = Product::query()->lockForUpdate()->find($data['product_id']);

                if ($product === null) {
                    throw ValidationException::withMessages(['product_id' => 'Ce produit n’existe plus.']);
                }

                $expectedArea = $data['category'] === 'boisson' ? 'refrigerateur' : 'vitrine';
                if (($product->stock_area ?: 'vitrine') !== $expectedArea) {
                    throw ValidationException::withMessages(['product_id' => 'Ce produit n’est pas disponible dans cet espace de stock.']);
                }

                if ($product->stock_quantity < 1) {
                    throw ValidationException::withMessages(['product_id' => 'Ce produit est en rupture de stock.']);
                }

                $label = $product->name;
                $price = (float) $product->price;
                $product->decrement('stock_quantity');
            }

            $sale = Sale::create([
                'work_day_id' => $activeDay->id,
                'client_id' => $data['client_id'] ?? null,
                'client_label' => $data['client_label'] ?? null,
                'employee_id' => $data['employee_id'],
                'category' => $data['category'],
                'total' => $price,
                'commission_amount' => $data['commission_amount'] ?? null,
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
