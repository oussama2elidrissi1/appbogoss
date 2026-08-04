<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmployeeServiceCommissionResource;
use App\Models\EmployeeServiceCommission;
use App\Services\ActivityLogger;
use App\Services\CommissionRuleRecalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class EmployeeServiceCommissionController extends Controller
{
    public function __construct(
        private readonly ActivityLogger $activityLogger,
        private readonly CommissionRuleRecalculator $recalculator,
    ) {
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

    /**
     * Accepts either a single `service_id` or a `service_ids` array — the
     * latter creates one identically-configured rule per selected service in
     * a single request, for "same commission, several services at once".
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'service_id' => ['required_without:service_ids', 'nullable', 'integer', 'exists:services,id'],
            'service_ids' => ['required_without:service_id', 'nullable', 'array', 'min:1'],
            'service_ids.*' => ['integer', 'distinct', 'exists:services,id'],
            'type' => ['required', Rule::in(['percentage', 'fixed'])],
            'value' => ['required', 'numeric', 'min:0'],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $serviceIds = $validated['service_ids'] ?? [$validated['service_id']];
        $common = collect($validated)->except(['service_id', 'service_ids'])->all();
        $recalculated = 0;

        $rules = DB::transaction(function () use ($serviceIds, $common, &$recalculated) {
            return collect($serviceIds)->map(function (int $serviceId) use ($common, &$recalculated) {
                $rule = EmployeeServiceCommission::create([...$common, 'service_id' => $serviceId, 'is_active' => true]);
                $this->activityLogger->log('commission_rule.created', $rule, [], [...$common, 'service_id' => $serviceId]);

                $updated = $this->recalculator->recalculate($rule);
                if ($updated > 0) {
                    $this->activityLogger->log('commission_rule.recalculated_history', $rule, [], ['entries_updated' => $updated]);
                }
                $recalculated += $updated;

                return $rule->load(['employee', 'service']);
            });
        });

        return response()->json([
            'data' => EmployeeServiceCommissionResource::collection($rules),
            'meta' => ['recalculated_count' => $recalculated],
        ], 201);
    }

    /**
     * Re-runs the retroactive recalculation for a rule that already exists —
     * for rules created before this feature shipped (or edited since), so
     * fixing history never requires deleting and recreating a rule.
     */
    public function recalculate(EmployeeServiceCommission $employeeServiceCommission): JsonResponse
    {
        $updated = $this->recalculator->recalculate($employeeServiceCommission);
        if ($updated > 0) {
            $this->activityLogger->log('commission_rule.recalculated_history', $employeeServiceCommission, [], ['entries_updated' => $updated]);
        }

        return response()->json(['meta' => ['recalculated_count' => $updated]]);
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
