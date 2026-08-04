<?php

namespace App\Console\Commands;

use App\Models\EmployeeServiceCommission;
use App\Services\ActivityLogger;
use App\Services\CommissionRuleRecalculator;
use Illuminate\Console\Command;

/**
 * One-shot backfill for commission rules that were created before the
 * retroactive-recalculation feature existed (or edited since) — those never
 * got their matching historical prestations/legacy sales resynced, since
 * that only runs automatically at rule *creation* time going forward.
 *
 * Safe to re-run any time: already-correct entries are left untouched
 * (compared before writing), cancelled/refunded commissions and deleted
 * sales are never touched, so running this twice never double-applies
 * anything.
 */
class RecalculateCommissions extends Command
{
    protected $signature = 'commissions:recalculate {--employee= : Only recalculate rules for this employee ID}';

    protected $description = "Retroactively recalculate historical commissions for all (or one employee's) commission rules";

    public function handle(CommissionRuleRecalculator $recalculator, ActivityLogger $activityLogger): int
    {
        $query = EmployeeServiceCommission::query()->with(['employee', 'service']);

        if ($employeeId = $this->option('employee')) {
            $query->where('employee_id', $employeeId);
        }

        $rules = $query->get();

        if ($rules->isEmpty()) {
            $this->info('No commission rules found.');

            return self::SUCCESS;
        }

        $this->info("Recalculating {$rules->count()} commission rule(s)...");
        $totalUpdated = 0;

        foreach ($rules as $rule) {
            $updated = $recalculator->recalculate($rule);
            $totalUpdated += $updated;

            if ($updated > 0) {
                $activityLogger->log('commission_rule.recalculated_history', $rule, [], ['entries_updated' => $updated]);
                $this->line("  {$rule->employee?->name} — {$rule->service?->name} ({$rule->value}%/{$rule->type}, depuis {$rule->starts_on}) : {$updated} entrée(s) mise(s) à jour");
            }
        }

        $this->newLine();
        $this->info("Done — {$totalUpdated} entrée(s) recalculée(s) au total.");

        return self::SUCCESS;
    }
}
