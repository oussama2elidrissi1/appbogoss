<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\Prestation;
use App\Models\Sale;
use App\Services\ActivityLogger;
use App\Services\CommissionResolver;
use Illuminate\Console\Command;

/**
 * One-shot fix for legacy caisse sales (recorded via "Nouvel encaissement"
 * before commission was auto-calculated at creation time) that were left
 * with a null commission_amount because the operator left the optional
 * field blank. Applies the employee's default_commission_rate — the only
 * thing that CAN be applied for a sale predating the sales.service_id
 * column, since there is no reliable link back to a specific service to
 * check for a more precise per-service rule.
 *
 * Sales already linked to a Prestation are skipped (their commission lives
 * on the Commission/PrestationItem rows instead), as are soft-deleted sales
 * and any sale that already has a commission recorded — even 0, which may
 * be a deliberate "no commission" entry, not a blank one.
 *
 * Safe to re-run: only ever touches rows where commission_amount is still
 * null, so running it twice never double-applies anything.
 */
class BackfillLegacyCommissions extends Command
{
    protected $signature = 'commissions:backfill-legacy {--employee= : Only backfill sales for this employee ID}';

    protected $description = "Apply each employee's default commission rate to legacy caisse sales left with no commission recorded";

    public function handle(CommissionResolver $commissionResolver, ActivityLogger $activityLogger): int
    {
        $employees = Employee::query()
            ->whereNotNull('default_commission_rate')
            ->when($this->option('employee'), fn ($query, $id) => $query->where('id', $id))
            ->get();

        if ($employees->isEmpty()) {
            $this->info('No employee with a default commission rate found.');

            return self::SUCCESS;
        }

        $linkedSaleIds = Prestation::whereNotNull('sale_id')->pluck('sale_id');
        $totalUpdated = 0;

        foreach ($employees as $employee) {
            $sales = Sale::where('employee_id', $employee->id)
                ->whereNull('commission_amount')
                ->whereNotIn('id', $linkedSaleIds)
                ->get();

            if ($sales->isEmpty()) {
                continue;
            }

            foreach ($sales as $sale) {
                $resolved = $commissionResolver->resolve($employee, $sale->service, (float) $sale->total, $sale->created_at);
                $sale->update(['commission_amount' => $resolved['amount']]);
            }

            $activityLogger->log('commission.backfilled_legacy_sales', $employee, [], ['sales_updated' => $sales->count()]);
            $this->line("  {$employee->name} : {$sales->count()} vente(s) mise(s) à jour");
            $totalUpdated += $sales->count();
        }

        $this->newLine();
        $this->info("Done — {$totalUpdated} vente(s) mise(s) à jour au total.");

        return self::SUCCESS;
    }
}
