<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Advance;
use App\Models\Commission;
use App\Models\Prestation;
use App\Models\Sale;
use App\Services\WorkDayService;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Throwable;

class ReportController extends Controller
{
    /** Advances grouped by employee over a free date range — the "gestion des avances" view in Rapports. */
    public function advances(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
        ]);

        $to = isset($validated['to']) ? Carbon::parse($validated['to']) : now();
        $from = isset($validated['from']) ? Carbon::parse($validated['from']) : $to->copy()->startOfMonth();

        $advances = Advance::with('employee')
            ->whereBetween('given_on', [$from->toDateString(), $to->toDateString()])
            ->when(
                ! empty($validated['employee_id']),
                fn ($query) => $query->where('employee_id', $validated['employee_id']),
            )
            ->orderByDesc('given_on')
            ->get();

        $byEmployee = $advances->groupBy('employee_id')
            ->map(function ($group, $employeeId) {
                $settled = $group->filter(fn (Advance $advance) => $advance->settled_at !== null);

                return [
                    'employee_id' => (int) $employeeId,
                    'employee_name' => $group->first()->employee->name ?? 'Employé',
                    'count' => $group->count(),
                    'total' => round((float) $group->sum('amount'), 2),
                    'settled_total' => round((float) $settled->sum('amount'), 2),
                    'outstanding_total' => round((float) $group->sum('amount') - $settled->sum('amount'), 2),
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->all();

        $settledTotal = (float) $advances->filter(fn (Advance $advance) => $advance->settled_at !== null)->sum('amount');

        return response()->json(['data' => [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'total' => round((float) $advances->sum('amount'), 2),
            'settled_total' => round($settledTotal, 2),
            'outstanding_total' => round((float) $advances->sum('amount') - $settledTotal, 2),
            'by_employee' => $byEmployee,
            'details' => $advances->map(fn (Advance $advance) => [
                'id' => $advance->id,
                'employee_id' => $advance->employee_id,
                'employee_name' => $advance->employee->name ?? 'Employé',
                'amount' => (float) $advance->amount,
                'reason' => $advance->reason,
                'given_on' => $advance->given_on?->toDateString(),
                'settled_at' => $advance->settled_at,
            ])->values()->all(),
        ]]);
    }

    /** Commissions calculées, groupées par employé, sur une période libre. */
    public function commissions(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
        ]);

        $to = isset($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : now();
        $from = isset($validated['from']) ? Carbon::parse($validated['from'])->startOfDay() : $to->copy()->startOfMonth();

        $commissions = Commission::with(['employee', 'service', 'prestation:id,reference,sale_id'])
            ->whereBetween('created_at', [$from, $to])
            ->when(
                ! empty($validated['employee_id']),
                fn ($query) => $query->where('employee_id', $validated['employee_id']),
            )
            ->orderByDesc('created_at')
            ->get();

        $deletedSaleIds = Sale::onlyTrashed()
            ->whereIn('id', $commissions->pluck('prestation.sale_id')->filter()->unique()->values())
            ->pluck('id')
            ->flip();

        $isLinkedToDeletedSale = fn (Commission $commission): bool => $commission->prestation?->sale_id !== null
            && $deletedSaleIds->has($commission->prestation->sale_id);

        $activeCommissions = $commissions->reject($isLinkedToDeletedSale);
        $validatedRows = $activeCommissions->where('status', Commission::STATUS_VALIDATED);

        $byEmployee = $activeCommissions->groupBy('employee_id')
            ->map(function ($group, $employeeId) {
                $validated = $group->where('status', Commission::STATUS_VALIDATED);

                return [
                    'employee_id' => (int) $employeeId,
                    'employee_name' => $group->first()->employee->name ?? 'Employé',
                    'count' => $validated->count(),
                    'total' => round((float) $validated->sum('amount'), 2),
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->all();

        return response()->json(['data' => [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'total' => round((float) $validatedRows->sum('amount'), 2),
            'cancelled_total' => round((float) $commissions->where('status', Commission::STATUS_CANCELLED)->sum('amount'), 2),
            'by_employee' => $byEmployee,
            'details' => $commissions->map(fn (Commission $commission) => [
                'id' => $commission->id,
                'date' => $commission->created_at?->toIso8601String(),
                'employee_name' => $commission->employee->name ?? 'Employé',
                'service_name' => $commission->service?->name,
                'prestation_reference' => $commission->prestation?->reference,
                'base_amount' => (float) $commission->base_amount,
                'amount' => (float) $commission->amount,
                'status' => $commission->status,
                'is_deleted' => $isLinkedToDeletedSale($commission),
            ])->values()->all(),
        ]]);
    }

    /** Prestations par statut sur une période — couvre les annulées/remboursées, absentes des ventes. */
    public function prestations(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $to = isset($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : now();
        $from = isset($validated['from']) ? Carbon::parse($validated['from'])->startOfDay() : $to->copy()->startOfMonth();

        $prestations = Prestation::whereBetween('created_at', [$from, $to])->get();

        $byStatus = $prestations->groupBy('status')
            ->map(fn ($group, $status) => [
                'status' => $status,
                'count' => $group->count(),
                'total' => round((float) $group->sum('total'), 2),
            ])
            ->values()
            ->all();

        return response()->json(['data' => [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'total_count' => $prestations->count(),
            'by_status' => $byStatus,
        ]]);
    }

    public function monthly(Request $request, WorkDayService $service): JsonResponse
    {
        $month = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
        ])['month'] ?? now()->format('Y-m');

        return response()->json([
            'data' => $service->buildMonthlyReport($month),
        ]);
    }

    public function monthlyPdf(Request $request, WorkDayService $service): Response|JsonResponse
    {
        $month = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
        ])['month'] ?? now()->format('Y-m');
        $report = $service->buildMonthlyReport($month);
        $viewData = ['report' => $report];

        if (! class_exists(Pdf::class)) {
            return response()->view('pdf.monthly-report', $viewData);
        }

        try {
            return Pdf::loadView('pdf.monthly-report', $viewData)
                ->download("rapport-mensuel-{$month}.pdf");
        } catch (Throwable) {
            return response()->view('pdf.monthly-report', $viewData);
        }
    }
}
