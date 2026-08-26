<?php

namespace App\Http\Controllers\Api\PosV2;

use App\Http\Controllers\Controller;
use App\Http\Resources\PosV2\PosInvoiceResource;
use App\Services\PosV2\PosService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PosHistoryController extends Controller
{
    public function __construct(private readonly PosService $pos) {}

    /** §34 — Caisse V2 history with the full filter set (§23-§24). */
    public function __invoke(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'time_from' => ['nullable', 'date_format:H:i'],
            'time_to' => ['nullable', 'date_format:H:i'],
            'status' => ['nullable', 'string', 'in:draft,in_progress,services_done,pending_payment,paid,cancelled,refunded'],
            'payment_method' => ['nullable', 'string', 'max:20'],
            'service_id' => ['nullable', 'integer', 'exists:services,id'],
            'category' => ['nullable', 'string', 'max:30'],
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'subscription' => ['nullable'],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = $this->pos->historyQuery($filters);
        $stats = $this->pos->historyStats((clone $query)->get());
        $paginator = $query->paginate((int) ($filters['per_page'] ?? 50));

        $summarySource = $paginator->getCollection();
        $paid = $summarySource->where('status', 'paid');

        return response()->json([
            'data' => PosInvoiceResource::collection($summarySource),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'page_paid_total' => round((float) $paid->sum(fn ($invoice) => (float) $invoice->total), 2),
                'page_paid_count' => $paid->count(),
                'stats' => $stats,
            ],
        ]);
    }
}
