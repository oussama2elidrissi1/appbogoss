<?php

namespace App\Services;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use App\Models\Service;

/**
 * A rule can be backdated (starts_on in the past) — when that happens, every
 * already-paid encaissement for this employee+service inside the rule's
 * window gets its commission recalculated through the very same resolver
 * used at payment time, so history matches the new configuration instead of
 * staying frozen on whatever applied before.
 *
 * Covers both the Prestation workflow (PrestationItem + Commission rows) and
 * legacy caisse quick-sales (Sale.commission_amount) — many salons ran
 * entirely on the old quick-sale flow before adopting prestations, so
 * limiting this to one or the other would leave most of an employee's real
 * history unsynced. Cancelled/refunded commissions and deleted sales are
 * left untouched — recalculating a voided amount would resurrect money that
 * was deliberately taken back out.
 *
 * Called both right after a rule is created (EmployeeServiceCommissionController)
 * and, for rules that already existed before this recalculation feature
 * shipped, via `php artisan commissions:recalculate`.
 */
class CommissionRuleRecalculator
{
    public function __construct(private readonly CommissionResolver $commissionResolver)
    {
    }

    public function recalculate(EmployeeServiceCommission $rule): int
    {
        $service = Service::find($rule->service_id);
        $employee = Employee::find($rule->employee_id);

        if ($service === null || $employee === null) {
            return 0;
        }

        return $this->recalculatePrestationItems($rule, $service, $employee)
            + $this->recalculateLegacySales($rule, $service, $employee);
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
            // whereNull('tip_id'): a line can also carry the 50% commission of
            // a tip, which no service rule ever recomputes.
            $commission = Commission::where('prestation_item_id', $item->id)
                ->where('status', Commission::STATUS_VALIDATED)
                ->whereNull('tip_id')
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
}
