<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTransactionRequest;
use App\Http\Resources\SaleResource;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\WorkDayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            $sale = Sale::create([
                'work_day_id' => $activeDay->id,
                'client_id' => $data['client_id'] ?? null,
                'client_label' => $data['client_label'] ?? null,
                'employee_id' => $data['employee_id'],
                'category' => $data['category'],
                'total' => $data['price'],
                'commission_amount' => $data['commission_amount'] ?? null,
                'payment_method' => $data['payment_method'] ?? 'especes',
            ]);

            SaleItem::create([
                'sale_id' => $sale->id,
                'itemable_type' => null,
                'itemable_id' => null,
                'label' => $data['label'],
                'quantity' => 1,
                'unit_price' => $data['price'],
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

    public function destroy(Sale $sale): JsonResponse
    {
        $sale->delete();
        $sale->load(['client', 'employee', 'items']);

        return response()->json(['data' => new SaleResource($sale)]);
    }
}
