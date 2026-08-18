<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Services\CommissionPayoutService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CommissionPayoutController extends Controller
{
    public function __construct(private readonly CommissionPayoutService $payoutService)
    {
    }

    /**
     * Payroll preview for every employee (or one, via employee_id) for a
     * given month — what they've earned, what's still owed from advances,
     * and what's left to pay. Used both by the standalone "Paie" page and by
     * the payroll tab on a single employee's own detail page.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', 'date_format:Y-m'],
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
        ]);
        $period = $validated['period'] ?? Carbon::now()->format('Y-m');

        $employees = Employee::query()->where('is_company', false)
            ->when(! empty($validated['employee_id']), fn ($query) => $query->where('id', $validated['employee_id']))
            ->orderBy('name')
            ->get();

        $rows = $employees->map(fn (Employee $employee) => $this->payoutService->preview($employee, $period));

        return response()->json([
            'data' => $rows->values(),
            'meta' => ['period' => $period],
        ]);
    }

    /**
     * Payout history for one employee — every month already paid, most
     * recent first. Shown on the employee's own detail page so an admin can
     * see what's already been settled without hunting through activity logs.
     */
    public function history(Request $request, Employee $employee): JsonResponse
    {
        $payouts = $employee->commissionPayouts()->with('paidBy')->orderByDesc('period')->get();

        return response()->json(['data' => $payouts->map(fn ($payout) => [
            'id' => $payout->id,
            'period' => $payout->period,
            'commission_total' => (float) $payout->commission_total,
            'advances_deducted' => (float) $payout->advances_deducted,
            'net_amount' => (float) $payout->net_amount,
            'paid_at' => $payout->paid_at->toIso8601String(),
            'paid_by' => $payout->paidBy?->name,
        ])]);
    }

    /**
     * Marks one employee as paid for a period — settles the advances it
     * covers in the same transaction. Never callable twice for the same
     * employee+period (enforced both here and by a DB unique constraint).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'period' => ['required', 'date_format:Y-m'],
            'notes' => ['nullable', 'string', 'max:255'],
            'deduct_from_caisse' => ['sometimes', 'boolean'],
        ]);

        $employee = Employee::findOrFail($validated['employee_id']);
        $payout = $this->payoutService->pay(
            $employee,
            $validated['period'],
            $request->user(),
            $validated['notes'] ?? null,
            (bool) ($validated['deduct_from_caisse'] ?? false),
        );

        return response()->json(['data' => [
            'id' => $payout->id,
            'employee_id' => $payout->employee_id,
            'period' => $payout->period,
            'commission_total' => (float) $payout->commission_total,
            'advances_deducted' => (float) $payout->advances_deducted,
            'net_amount' => (float) $payout->net_amount,
            'paid_at' => $payout->paid_at->toIso8601String(),
            'paid_by' => $payout->paidBy?->name,
        ]], 201);
    }
}
