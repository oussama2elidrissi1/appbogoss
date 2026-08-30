<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MonthlyClosure;
use App\Services\MonthlyClosureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Monthly closure surface. Every decision lives in MonthlyClosureService —
 * this class validates input, calls it, and shapes the response.
 */
class MonthlyClosureController extends Controller
{
    public function __construct(private readonly MonthlyClosureService $closures)
    {
    }

    /**
     * The period selector of both clients: which month is current, which are
     * finished but still open, which are closed.
     *
     * Readable by anyone already allowed on the payroll screen — knowing that
     * August is still open is not privileged information, and both React and
     * Flutter need it to draw their selector.
     */
    public function periods(): JsonResponse
    {
        return response()->json(['data' => $this->closures->periods()]);
    }

    /**
     * Full pre-closing verification for one month. Rebuilt live on every call.
     */
    public function checklist(Request $request, string $period): JsonResponse
    {
        $this->assertPeriodFormat($period);

        return response()->json(['data' => $this->closures->checklist($period)]);
    }

    /**
     * Closes the month for good.
     *
     * `confirmed` must be true — but that is a deliberate speed bump, not the
     * control: the service rebuilds and revalidates the entire checklist
     * inside its transaction, so a client that lies about the checkbox still
     * gets refused on the real state.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['required', 'date_format:Y-m'],
            'confirmed' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        if ($validated['confirmed'] !== true) {
            throw ValidationException::withMessages([
                'confirmed' => 'Confirmez avoir vérifié les employés, les paiements et les journées de caisse.',
            ]);
        }

        $closure = $this->closures->close(
            $validated['period'],
            $request->user(),
            $validated['notes'] ?? null,
        );

        return response()->json(['data' => $this->present($closure)], 201);
    }

    /**
     * Closure history — Super Admin only (`months.history.view`). A closed
     * month leaves the admin's screens for good, so this is the only way back
     * to it.
     */
    public function index(): JsonResponse
    {
        $closures = MonthlyClosure::with('closedBy')->orderByDesc('period')->get();

        return response()->json([
            'data' => $closures->map(fn (MonthlyClosure $closure) => $this->present($closure, withReport: false)),
        ]);
    }

    public function show(string $period): JsonResponse
    {
        $this->assertPeriodFormat($period);

        $closure = MonthlyClosure::with('closedBy')->where('period', $period)->firstOrFail();

        return response()->json(['data' => $this->present($closure)]);
    }

    private function present(MonthlyClosure $closure, bool $withReport = true): array
    {
        $report = $closure->closing_report ?? [];
        $totals = $report['totals'] ?? [];
        $workDays = $report['work_days'] ?? [];

        return [
            'id' => $closure->id,
            'period' => $closure->period,
            'status' => 'closed',
            'closed_at' => $closure->closed_at->toIso8601String(),
            'closed_by' => $closure->closedBy?->name,
            'notes' => $closure->notes,
            'employees_count' => $totals['employees_count'] ?? 0,
            'commission_total' => $totals['commission_total'] ?? 0,
            'payouts_total' => $totals['payouts_total'] ?? 0,
            'advances_applied_total' => $totals['advances_applied_total'] ?? 0,
            'work_days_count' => $workDays['total'] ?? 0,
            'closing_report' => $withReport ? $report : null,
        ];
    }

    private function assertPeriodFormat(string $period): void
    {
        if (preg_match('/^\d{4}-\d{2}$/', $period) !== 1) {
            throw ValidationException::withMessages([
                'period' => 'Période invalide : format attendu AAAA-MM.',
            ]);
        }
    }
}
