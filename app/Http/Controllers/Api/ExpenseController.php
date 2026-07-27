<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExpenseRequest;
use App\Http\Resources\ExpenseResource;
use App\Models\Expense;
use App\Services\WorkDayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ExpenseController extends Controller
{
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
}
