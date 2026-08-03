<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Advance;
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
