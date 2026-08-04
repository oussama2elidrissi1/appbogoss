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
     * Payroll preview for every employee for a given month — what they've
     * earned, what's still owed from advances, and what's left to pay.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', 'date_format:Y-m'],
        ]);
        $period = $validated['period'] ?? Carbon::now()->format('Y-m');

        $employees = Employee::query()->where('is_company', false)->orderBy('name')->get();

        $rows = $employees->map(fn (Employee $employee) => $this->payoutService->preview($employee, $period));

        return response()->json([
            'data' => $rows->values(),
            'meta' => ['period' => $period],
        ]);
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
        ]);

        $employee = Employee::findOrFail($validated['employee_id']);
        $payout = $this->payoutService->pay($employee, $validated['period'], $request->user(), $validated['notes'] ?? null);

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
