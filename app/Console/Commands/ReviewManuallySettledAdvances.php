<?php

namespace App\Console\Commands;

use App\Models\Advance;
use App\Services\ActivityLogger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Finds advances that were marked "réglée" by hand — settled_at is set but no
 * commission_payout_id — and can put them back as outstanding so the payroll
 * deducts them again.
 *
 * Why this exists: an advance is a draw against commission. Paying the month
 * ("Marquer comme payé") deducts every outstanding advance and settles it.
 * Settling one by hand instead made it stop counting against the commission,
 * so the next payout handed over the FULL amount — the salon paid that money
 * twice. The button that did this in one click is gone, but rows it already
 * created still sit in the database, silently inflating the next "net à payer".
 *
 * Not every such row is a mistake: `advances:settle-before` legitimately
 * creates them for money genuinely reimbursed off-app, and the database
 * cannot tell the two apart. So this command NEVER decides for you — it
 * lists what it found and only changes rows when you pass --restore, and
 * even then only the ids/employee you explicitly scope it to.
 */
class ReviewManuallySettledAdvances extends Command
{
    protected $signature = 'advances:review-manual-settlements
        {--employee= : Only look at this employee ID}
        {--id=* : Only these advance IDs (repeatable)}
        {--restore : Actually put them back as outstanding (without this, nothing is modified)}';

    protected $description = 'List (and optionally undo) advances marked settled by hand, which stop being deducted from the commission';

    public function handle(ActivityLogger $activityLogger): int
    {
        $advances = Advance::query()
            ->whereNotNull('settled_at')
            ->whereNull('commission_payout_id')
            ->when($this->option('employee'), fn ($query, $id) => $query->where('employee_id', $id))
            ->when($this->option('id'), fn ($query, $ids) => $query->whereIn('id', $ids))
            ->with('employee')
            ->orderBy('employee_id')
            ->orderBy('given_on')
            ->get();

        if ($advances->isEmpty()) {
            $this->info('Aucune avance réglée à la main. Rien à corriger.');

            return self::SUCCESS;
        }

        $this->warn(sprintf(
            '%d avance(s) réglée(s) à la main, pour %s MAD au total.',
            $advances->count(),
            number_format((float) $advances->sum('amount'), 2),
        ));
        $this->line("Ces montants ne sont PLUS déduits de la commission — ils seront payés une deuxième fois si vous ne les restaurez pas.");
        $this->newLine();

        $this->table(
            ['ID', 'Employé', 'Montant', 'Donnée le', 'Réglée le', 'Motif'],
            $advances->map(fn (Advance $advance) => [
                $advance->id,
                $advance->employee?->name ?? '?',
                number_format((float) $advance->amount, 2).' MAD',
                $advance->given_on->toDateString(),
                $advance->settled_at->toDateTimeString(),
                $advance->reason ?: '—',
            ])->all(),
        );

        if (! $this->option('restore')) {
            $this->newLine();
            $this->info('Lecture seule — rien n\'a été modifié.');
            $this->line('Pour restaurer, relancez avec --restore (ajoutez --employee=ID ou --id=ID pour cibler).');
            $this->line('Gardez réglées celles dont l\'employé a réellement rendu l\'argent en espèces.');

            return self::SUCCESS;
        }

        if (! $this->confirm(sprintf('Restaurer ces %d avance(s) comme "en cours" ?', $advances->count()), false)) {
            $this->info('Annulé — rien n\'a été modifié.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($advances, $activityLogger) {
            Advance::whereIn('id', $advances->pluck('id'))->update(['settled_at' => null]);

            foreach ($advances->groupBy('employee_id') as $employeeId => $rows) {
                $activityLogger->log('advance.manual_settlement_reverted', $rows->first()->employee, [], [
                    'employee_id' => $employeeId,
                    'reverted_count' => $rows->count(),
                    'reverted_total' => round((float) $rows->sum('amount'), 2),
                    'advance_ids' => $rows->pluck('id')->all(),
                ]);
            }
        });

        $this->newLine();
        $this->info(sprintf(
            '%d avance(s) restaurée(s) — %s MAD seront de nouveau déduits de la commission.',
            $advances->count(),
            number_format((float) $advances->sum('amount'), 2),
        ));

        return self::SUCCESS;
    }
}
