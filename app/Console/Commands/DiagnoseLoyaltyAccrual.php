<?php

namespace App\Console\Commands;

use App\Models\LoyaltyLedgerEntry;
use App\Models\LoyaltyProgram;
use App\Models\Prestation;
use App\Models\Sale;
use App\Services\LoyaltyEngine;
use Illuminate\Console\Command;

/**
 * Answers "why is nobody progressing on my loyalty program?" against real
 * sales. For every recent sale × active program it reports whether progress
 * was counted, and if not, the exact reason: no client fiché (walk-ins can
 * never accrue — there is no account to credit), category mismatch, service
 * mismatch… Sales that SHOULD have counted but have no ledger entry can be
 * caught up with --reprocess, which is safe by construction: the engine's
 * ledger writes go through insertOrIgnore on a unique (sale, program,
 * direction) key, so re-running it never double-counts anything.
 */
class DiagnoseLoyaltyAccrual extends Command
{
    protected $signature = 'loyalty:diagnose
        {--days=7 : Examine les ventes des N derniers jours}
        {--reprocess : Rattrape les ventes qui auraient dû cumuler mais n\'ont aucune écriture}';

    protected $description = "Explique, vente par vente, pourquoi le cumul fidélité s'est fait ou non — et rattrape les manquées avec --reprocess";

    public function handle(LoyaltyEngine $engine): int
    {
        $days = max(1, (int) $this->option('days'));

        $programs = LoyaltyProgram::query()
            ->where('is_active', true)
            ->whereIn('type', [
                LoyaltyProgram::TYPE_SERVICE_COUNT,
                LoyaltyProgram::TYPE_POINTS,
                LoyaltyProgram::TYPE_AMOUNT_SPENT,
                LoyaltyProgram::TYPE_VISIT_COUNT,
            ])
            ->get();

        if ($programs->isEmpty()) {
            $this->warn('Aucun programme actif de type cumulable (services/points/montant/visites).');

            return self::SUCCESS;
        }

        $sales = Sale::query()
            ->where('created_at', '>=', now()->subDays($days)->startOfDay())
            ->orderByDesc('created_at')
            ->get();

        $this->info(sprintf('%d vente(s) examinée(s) sur %d jour(s), %d programme(s) actif(s).', $sales->count(), $days, $programs->count()));

        $toReprocess = [];

        foreach ($programs as $program) {
            $config = $program->config ?? [];
            $serviceIds = ! empty($config['service_ids']) && is_array($config['service_ids'])
                ? array_map('intval', $config['service_ids'])
                : (! empty($config['service_id']) ? [(int) $config['service_id']] : []);
            $category = $config['category'] ?? null;

            $this->newLine();
            $this->line(sprintf(
                '<options=bold>%s</> (type %s, seuil %s%s%s)',
                $program->name,
                $program->type,
                $config['threshold'] ?? '—',
                $category ? ', catégorie « '.$category.' »' : '',
                ! empty($serviceIds) ? ', service(s) #'.implode(', #', $serviceIds) : '',
            ));

            // A category filter AND a service filter that point at different
            // categories can never both match — the program is dead on
            // arrival. New configs are refused at save time; this flags the
            // ones already stored so nobody chases phantom accrual issues.
            if ($category !== null && ! empty($serviceIds)) {
                $mismatch = \App\Models\Service::whereIn('id', $serviceIds)
                    ->where('category', '!=', $category)
                    ->first();
                if ($mismatch !== null) {
                    $this->error(sprintf(
                        '  ✗ CONFIGURATION CONTRADICTOIRE : le service « %s » (#%d) est de catégorie « %s », pas « %s » — ce programme ne peut JAMAIS cumuler.',
                        $mismatch->name,
                        $mismatch->id,
                        $mismatch->category,
                        $category,
                    ));
                    $this->line('    → Corrigez-le dans Programmes de fidélité (Modifier), retirez la catégorie ou le service, puis relancez avec --reprocess.');
                }
            }

            $counts = ['counted' => 0, 'no_client' => 0, 'category' => 0, 'service' => 0, 'missing' => 0];
            $missingRows = [];

            foreach ($sales as $sale) {
                $status = $this->classify($sale, $program, $serviceIds, $category);
                $counts[$status]++;

                if ($status === 'missing') {
                    $toReprocess[$sale->id] = $sale;
                    $missingRows[] = [
                        $sale->id,
                        $sale->created_at->format('d/m H:i'),
                        $sale->client?->name ?? '?',
                        $sale->label ?? $sale->category ?? '(prestation)',
                        number_format((float) $sale->total, 2).' MAD',
                    ];
                }
            }

            $this->line(sprintf('  ✓ %d déjà comptée(s)', $counts['counted']));
            if ($counts['no_client'] > 0) {
                $this->line(sprintf('  – %d sans client fiché (client de passage) → aucun cumul possible', $counts['no_client']));
            }
            if ($counts['category'] > 0) {
                $this->line(sprintf('  – %d enregistrée(s) sous une autre catégorie', $counts['category']));
            }
            if ($counts['service'] > 0) {
                $this->line(sprintf('  – %d sur un autre service', $counts['service']));
            }
            if ($counts['missing'] > 0) {
                $this->warn(sprintf('  ⚠ %d aurai(en)t dû cumuler mais aucune écriture — rattrapable avec --reprocess', $counts['missing']));
                $this->table(['Vente', 'Date', 'Client', 'Libellé', 'Montant'], $missingRows);
            }
        }

        if (empty($toReprocess)) {
            $this->newLine();
            $this->info('Rien à rattraper.');

            return self::SUCCESS;
        }

        if (! $this->option('reprocess')) {
            $this->newLine();
            $this->line(sprintf('Relancez avec --reprocess pour rattraper ces %d vente(s). Aucun double comptage possible (écritures idempotentes).', count($toReprocess)));

            return self::SUCCESS;
        }

        if (! $this->confirm(sprintf('Repasser %d vente(s) dans le moteur de fidélité ?', count($toReprocess)), false)) {
            $this->info('Annulé — rien n\'a été modifié.');

            return self::SUCCESS;
        }

        $before = LoyaltyLedgerEntry::count();
        foreach ($toReprocess as $sale) {
            $engine->processSale($sale, Prestation::where('sale_id', $sale->id)->first());
        }
        $added = LoyaltyLedgerEntry::count() - $before;

        $this->newLine();
        $this->info(sprintf('%d écriture(s) de cumul créée(s). L\'avancement des clients est à jour.', $added));

        return self::SUCCESS;
    }

    /**
     * Mirror of LoyaltyEngine::accrueForProgram's line filter, flattened for
     * diagnosis: returns why this sale did or didn't count for this program.
     *
     * @param  array<int, int>  $serviceIds
     */
    private function classify(Sale $sale, LoyaltyProgram $program, array $serviceIds, ?string $category): string
    {
        $counted = LoyaltyLedgerEntry::where('sourceable_type', Sale::class)
            ->where('sourceable_id', $sale->id)
            ->where('loyalty_program_id', $program->id)
            ->where('direction', LoyaltyLedgerEntry::DIRECTION_ACCRUAL)
            ->exists();
        if ($counted) {
            return 'counted';
        }

        if ($sale->client_id === null) {
            return 'no_client';
        }

        // Visit-count programs accrue on any sale, no line filter.
        if ($program->type === LoyaltyProgram::TYPE_VISIT_COUNT) {
            return 'missing';
        }

        $prestation = Prestation::where('sale_id', $sale->id)->first();
        $lines = $prestation !== null
            ? $prestation->items->map(fn ($item) => [
                'service_id' => $item->service_id,
                'category' => $item->service?->category,
            ])->all()
            : [['service_id' => $sale->service_id, 'category' => $sale->category]];

        $serviceMismatch = false;
        $categoryMismatch = false;
        foreach ($lines as $line) {
            if (! empty($serviceIds) && ! in_array((int) $line['service_id'], $serviceIds, true)) {
                $serviceMismatch = true;
                continue;
            }
            if (! empty($category) && $line['category'] !== $category) {
                $categoryMismatch = true;
                continue;
            }

            return 'missing';
        }

        return $categoryMismatch ? 'category' : ($serviceMismatch ? 'service' : 'category');
    }
}
