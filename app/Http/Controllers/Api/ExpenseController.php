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
        $expense->load('workDay');

        return response()->json(['data' => new ExpenseResource($expense)], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'work_day_id' => ['nullable', 'integer', Rule::exists('work_days', 'id')],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $query = Expense::query()->with('workDay')->orderByDesc('spent_on')->orderByDesc('id');

        if (! empty($validated['work_day_id'])) {
            $query->where('work_day_id', $validated['work_day_id']);
        }
        if (! empty($validated['from'])) {
            $query->whereDate('spent_on', '>=', $validated['from']);
        }
        if (! empty($validated['to'])) {
            $query->whereDate('spent_on', '<=', $validated['to']);
        }

        return response()->json(['data' => ExpenseResource::collection($query->get())]);
    }

    /**
     * Corrects an expense recorded under the wrong caisse day — the create
     * form only ever attached new expenses to whichever day was open at the
     * time, ignoring a backdated `spent_on`, so anything entered for a past
     * date silently landed in today's report instead of its own.
     *
     * Super Admin only: moving an expense between days (or editing its
     * amount) rewrites the days' net results after the fact.
     */
    public function update(Request $request, Expense $expense): JsonResponse
    {
        $this->assertSuperAdmin($request);

        $validated = $request->validate([
            'label' => ['sometimes', 'string', 'max:255'],
            'category' => ['sometimes', 'string', 'max:255'],
            'amount' => ['sometimes', 'numeric', 'min:0'],
            'spent_on' => ['sometimes', 'date'],
            'work_day_id' => ['sometimes', 'nullable', 'integer', 'exists:work_days,id'],
        ]);

        $before = $expense->only(array_keys($validated));
        $expense->update($validated);

        $this->activityLogger->log('expense.updated', $expense, $before, $validated);

        return response()->json(['data' => new ExpenseResource($expense->fresh()->load('workDay'))]);
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
        $this->assertSuperAdmin($request);

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

    /**
     * Erases an expense entered by mistake. Super Admin only — it rewrites
     * the day's net result after the fact, and unlike an advance there is
     * no patron-password fallback wired for expenses; the full audit trail
     * of what was removed goes to the activity log first.
     */
    public function destroy(Request $request, Expense $expense): JsonResponse
    {
        $this->assertSuperAdmin($request);

        $this->activityLogger->log('expense.deleted', $expense, [
            'label' => $expense->label,
            'category' => $expense->category,
            'amount' => round((float) $expense->amount, 2),
            'spent_on' => (string) $expense->spent_on,
            'work_day_id' => $expense->work_day_id,
        ], []);

        $expense->delete();

        return response()->json(status: 204);
    }

    /**
     * Moving, converting or deleting an expense rewrites a caisse day's net
     * result after the fact — reserved to the Super Admin, same authority
     * rule the rest of the app applies to that role.
     */
    private function assertSuperAdmin(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasRole('super-admin'), 403, 'Action réservée au Super Admin.');
    }
}
