<?php

namespace App\Services;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\Sale;
use App\Models\Tip;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * The single source of truth for "how much has this employee actually
 * earned" — shared by MeController (their own dashboard/report) and the
 * commission payout screen (what BOGOSLAND owes them this month), so the
 * two views can never drift out of sync the way they did before this was
 * extracted (dashboard cards silently disagreeing with "Mon rapport").
 *
 * Blends two sources: the Prestation workflow's audited Commission rows,
 * and legacy caisse quick-sales (Sale.commission_amount) — many salons ran
 * entirely on the old quick-sale flow before adopting prestations, so
 * limiting either calculation to one source alone misses real earnings.
 */
class EmployeeEarningsService
{
    /**
     * Sales tied to this employee that were recorded straight from the caisse
     * (legacy quick-checkout, or an admin picking them from the employee
     * list) rather than through the Prestation workflow. Excludes sales the
     * Prestation workflow already created at payment confirmation, so a paid
     * prestation is never counted twice.
     */
    public function legacySales(Employee $employee): Builder
    {
        $linkedSaleIds = Prestation::where('employee_id', $employee->id)
            ->whereNotNull('sale_id')
            ->pluck('sale_id');

        // withTrashed(): a sale voided at the caisse must still show up here,
        // marked deleted, exactly like it does in the admin's day ledger — it
        // must never silently vanish from the employee's own history.
        return Sale::withTrashed()
            ->where('employee_id', $employee->id)
            ->whereNotIn('id', $linkedSaleIds);
    }

    /**
     * Sale ids among the given list that have been voided ("supprimé") at
     * the caisse — used both for prestation-derived and legacy sales, so a
     * deleted encaissement is excluded from revenue/commission totals
     * wherever it's tied to this employee.
     *
     * @param  Collection<int, int>  $saleIds
     * @return Collection<int, bool>
     */
    public function deletedSaleIds(Collection $saleIds): Collection
    {
        if ($saleIds->isEmpty()) {
            return collect();
        }

        return Sale::onlyTrashed()->whereIn('id', $saleIds)->pluck('id')->flip();
    }

    /**
     * Validated commissions for this employee, excluding any whose
     * prestation had its encaissement voided directly at the caisse. The
     * Commission row itself is never mutated (it stays "validated" for the
     * audit trail) — this only decides what counts toward the employee's
     * own totals.
     */
    public function activeValidatedCommissions(int $employeeId, ?Carbon $from = null, ?Carbon $to = null, ?Carbon $onDate = null): Collection
    {
        $query = Commission::where('employee_id', $employeeId)
            ->where('status', Commission::STATUS_VALIDATED)
            ->with('prestation:id,sale_id');

        if ($onDate !== null) {
            $query->whereDate('created_at', $onDate);
        }
        if ($from !== null) {
            $query->where('created_at', '>=', $from);
        }
        if ($to !== null) {
            $query->where('created_at', '<=', $to);
        }

        $commissions = $query->get();
        $deletedSaleIds = $this->deletedSaleIds(
            $commissions->pluck('prestation.sale_id')->filter()->values(),
        );

        return $commissions->reject(
            fn (Commission $commission) => $commission->prestation?->sale_id !== null
                && $deletedSaleIds->has($commission->prestation->sale_id),
        );
    }

    /**
     * Tips this employee was given over a date range — the pourboire money
     * itself, which never enters the salon's CA (§40) but is theirs to see.
     * Refunded invoices soft-delete their tips, and a ticket voided at the
     * caisse is excluded here too, so the figure can never contradict what
     * the caisse shows.
     *
     * @return Collection<int, Tip>
     */
    public function activeTips(int $employeeId, Carbon $from, Carbon $to): Collection
    {
        $tips = Tip::where('employee_id', $employeeId)
            ->whereBetween('created_at', [$from, $to])
            ->with('prestation:id,sale_id')
            ->get();

        $deletedSaleIds = $this->deletedSaleIds(
            $tips->pluck('prestation.sale_id')->filter()->values(),
        );

        return $tips->reject(
            fn (Tip $tip) => $tip->prestation?->sale_id !== null
                && $deletedSaleIds->has($tip->prestation->sale_id),
        );
    }

    public function tipsTotal(int $employeeId, Carbon $from, Carbon $to): float
    {
        return round((float) $this->activeTips($employeeId, $from, $to)->sum('amount'), 2);
    }

    /**
     * The share of commissionEarnedTotal() that comes from tips (50% of each
     * coiffure pourboire) — shown as a breakdown so an employee can tell
     * service commission from tip commission.
     */
    public function tipCommissionTotal(int $employeeId, Carbon $from, Carbon $to): float
    {
        return round((float) $this->activeValidatedCommissions($employeeId, from: $from, to: $to)
            ->where('type', Commission::TYPE_TIP)
            ->sum('amount'), 2);
    }

    /**
     * Total commission actually earned by this employee over a date range —
     * Prestation-workflow commissions plus legacy caisse commissions,
     * excluding anything voided at the caisse. This is the figure the
     * monthly commission payout is computed from.
     */
    public function commissionEarnedTotal(Employee $employee, Carbon $from, Carbon $to): float
    {
        $prestationTotal = (float) $this->activeValidatedCommissions($employee->id, from: $from, to: $to)->sum('amount');

        $legacySales = $this->legacySales($employee)
            ->where('created_at', '>=', $from)
            ->where('created_at', '<=', $to)
            ->get()
            ->reject(fn (Sale $sale) => $sale->trashed());

        return round($prestationTotal + (float) $legacySales->sum('commission_amount'), 2);
    }
}
