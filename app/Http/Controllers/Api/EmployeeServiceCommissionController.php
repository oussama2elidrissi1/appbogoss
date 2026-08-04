<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmployeeServiceCommissionResource;
use App\Models\EmployeeServiceCommission;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmployeeServiceCommissionController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
        ]);

        $query = EmployeeServiceCommission::query()->with(['employee', 'service'])->orderByDesc('starts_on');

        if (! empty($validated['employee_id'])) {
            $query->where('employee_id', $validated['employee_id']);
        }

        return response()->json(['data' => EmployeeServiceCommissionResource::collection($query->get())]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'type' => ['required', Rule::in(['percentage', 'fixed'])],
            'value' => ['required', 'numeric', 'min:0'],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $rule = EmployeeServiceCommission::create([...$validated, 'is_active' => true]);

        $this->activityLogger->log('commission_rule.created', $rule, [], $validated);

        return response()->json(['data' => new EmployeeServiceCommissionResource($rule->load(['employee', 'service']))], 201);
    }

    public function update(Request $request, EmployeeServiceCommission $employeeServiceCommission): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['sometimes', Rule::in(['percentage', 'fixed'])],
            'value' => ['sometimes', 'numeric', 'min:0'],
            'starts_on' => ['sometimes', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'is_active' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $before = $employeeServiceCommission->only(array_keys($validated));
        $employeeServiceCommission->update($validated);

        $this->activityLogger->log('commission_rule.updated', $employeeServiceCommission, $before, $validated);

        return response()->json(['data' => new EmployeeServiceCommissionResource($employeeServiceCommission->fresh(['employee', 'service']))]);
    }

    public function destroy(EmployeeServiceCommission $employeeServiceCommission): JsonResponse
    {
        $this->activityLogger->log('commission_rule.deleted', $employeeServiceCommission);

        $employeeServiceCommission->delete();

        return response()->json(status: 204);
    }
}
