<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExpenseRequest;
use App\Http\Resources\AdvanceResource;
use App\Http\Resources\ExpenseResource;
use App\Models\Advance;
use App\Models\Expense;
use App\Services\ActivityLogger;
use App\Services\WorkDayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ExpenseController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function store(StoreExpenseRequest $request, WorkDayService $service): JsonResponse
    {
        $data = $request->validated();

        if (empty($data['work_day_id'])) {
            $activeDay = $service->getActiveDay();
            $data['work_day_id'] = $activeDay?->id;
        }

        $expense = Expense::create($data);

        return response()->json(['data' => new ExpenseResource($expense)], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'work_day_id' => ['nullable', 'integer', Rule::exists('work_days', 'id')],
        ]);

        $query = Expense::query()->orderByDesc('spent_on');

        if (! empty($validated['work_day_id'])) {
            $query->where('work_day_id', $validated['work_day_id']);
        }

        return response()->json(['data' => ExpenseResource::collection($query->get())]);
    }

    /**
     * Fixes an expense that was actually a salary advance recorded in the
     * wrong place (the "Dépenses" form has no employee field, so this
     * happened before the caisse-day picker existed on the Avances form) —
     * moves it into a proper Advance tied to the same day and amount, and
     * removes the expense so it stops inflating "Dépenses" and double
     * counting against the day's net result.
     */
    public function convertToAdvance(Request $request, Expense $expense): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
        ]);

        $advance = DB::transaction(function () use ($expense, $validated) {
            $advance = Advance::create([
                'employee_id' => $validated['employee_id'],
                'work_day_id' => $expense->work_day_id,
                'amount' => $expense->amount,
                'reason' => $expense->label,
                'given_on' => $expense->spent_on,
            ]);

            $this->activityLogger->log('expense.converted_to_advance', $advance, [
                'expense_id' => $expense->id,
                'expense_label' => $expense->label,
                'expense_category' => $expense->category,
            ], ['advance_id' => $advance->id]);

            $expense->delete();

            return $advance;
        });

        $advance->load(['employee', 'workDay']);

        return response()->json(['data' => new AdvanceResource($advance)], 201);
    }
}
