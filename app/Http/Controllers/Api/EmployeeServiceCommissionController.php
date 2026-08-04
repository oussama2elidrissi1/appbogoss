<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmployeeServiceCommissionResource;
use App\Models\Commission;
use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use App\Models\Service;
use App\Services\ActivityLogger;
use App\Services\CommissionResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class EmployeeServiceCommissionController extends Controller
{
    public function __construct(
        private readonly ActivityLogger $activityLogger,
        private readonly CommissionResolver $commissionResolver,
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

                $recalculated += $this->recalculatePastCommissions($rule);

                return $rule->load(['employee', 'service']);
            });
        });

        return response()->json([
            'data' => EmployeeServiceCommissionResource::collection($rules),
            'meta' => ['recalculated_count' => $recalculated],
        ], 201);
    }

    /**
     * A rule can be backdated (starts_on in the past) — when that happens,
     * every already-paid encaissement for this employee+service inside the
     * rule's window gets its commission recalculated through the very same
     * resolver used at payment time, so history matches the new
     * configuration instead of staying frozen on whatever applied before.
     * Covers both the Prestation workflow (PrestationItem + Commission rows)
     * and legacy caisse quick-sales (Sale.commission_amount) — many salons
     * ran entirely on the old quick-sale flow before adopting prestations,
     * so limiting this to one or the other would leave most of an
     * employee's real history unsynced. Cancelled/refunded commissions and
     * deleted sales are left untouched — recalculating a voided amount
     * would resurrect money that was deliberately taken back out.
     */
    private function recalculatePastCommissions(EmployeeServiceCommission $rule): int
    {
        $service = Service::find($rule->service_id);
        $employee = Employee::find($rule->employee_id);

        if ($service === null || $employee === null) {
            return 0;
        }

        $updated = $this->recalculatePrestationItems($rule, $service, $employee)
            + $this->recalculateLegacySales($rule, $service, $employee);

        if ($updated > 0) {
            $this->activityLogger->log('commission_rule.recalculated_history', $rule, [], [
                'entries_updated' => $updated,
            ]);
        }

        return $updated;
    }

    private function recalculatePrestationItems(EmployeeServiceCommission $rule, Service $service, Employee $employee): int
    {
        $items = PrestationItem::query()
            ->where('service_id', $rule->service_id)
            ->whereHas('prestation', function ($query) use ($rule) {
                $query->where('employee_id', $rule->employee_id)
                    ->where('status', Prestation::STATUS_PAID)
                    ->whereDate('confirmed_at', '>=', $rule->starts_on);

                if ($rule->ends_on !== null) {
                    $query->whereDate('confirmed_at', '<=', $rule->ends_on);
                }
            })
            ->with('prestation')
            ->get();

        $updated = 0;

        foreach ($items as $item) {
            $commission = Commission::where('prestation_item_id', $item->id)
                ->where('status', Commission::STATUS_VALIDATED)
                ->first();

            if ($commission === null) {
                continue;
            }

            $prestation = $item->prestation;
            $resolved = $this->commissionResolver->resolve(
                $employee,
                $service,
                (float) $item->lineTotal(),
                $prestation->confirmed_at,
            );

            if ($resolved['amount'] === (float) $item->commission_amount && $resolved['rule_id'] === $item->commission_rule_id) {
                continue;
            }

            $item->update([
                'commission_type' => $resolved['type'],
                'commission_value' => $resolved['value'],
                'commission_amount' => $resolved['amount'],
                'commission_rule_id' => $resolved['rule_id'],
            ]);

            $commission->update([
                'rule_id' => $resolved['rule_id'],
                'type' => $resolved['type'],
                'rate_or_amount' => $resolved['value'],
                'amount' => $resolved['amount'],
            ]);

            $updated++;
        }

        return $updated;
    }

    /**
     * Legacy quick-sales have no service_id column (the old caisse form only
     * ever stored a free-text label) — matching on the item's label against
     * this exact service's name is the only link available. Sales already
     * tied to a Prestation are skipped; those are handled above and their
     * commission_amount column is never populated in the first place.
     */
    private function recalculateLegacySales(EmployeeServiceCommission $rule, Service $service, Employee $employee): int
    {
        $linkedSaleIds = Prestation::where('employee_id', $rule->employee_id)
            ->whereNotNull('sale_id')
            ->pluck('sale_id');

        $sales = Sale::where('employee_id', $rule->employee_id)
            ->whereNotIn('id', $linkedSaleIds)
            ->whereDate('created_at', '>=', $rule->starts_on)
            ->when(
                $rule->ends_on !== null,
                fn ($query) => $query->whereDate('created_at', '<=', $rule->ends_on),
            )
            ->with('items')
            ->get()
            ->filter(fn (Sale $sale) => $sale->items->contains(fn ($item) => $item->label === $service->name));

        $updated = 0;

        foreach ($sales as $sale) {
            $baseAmount = (float) $sale->items->sum(fn ($item) => $item->quantity * $item->unit_price);
            $resolved = $this->commissionResolver->resolve($employee, $service, $baseAmount, $sale->created_at);

            if ($resolved['amount'] === (float) $sale->commission_amount) {
                continue;
            }

            $sale->update(['commission_amount' => $resolved['amount']]);
            $updated++;
        }

        return $updated;
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
