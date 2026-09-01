<?php

namespace App\Console\Commands;

use App\Models\WorkDay;
use App\Services\WalletService;
use App\Services\WorkDayService;
use Illuminate\Console\Command;

/**
 * Rattrape les journées clôturées que le portefeuille n'a jamais créditées.
 *
 * Le crédit d'une journée se fait AU MOMENT de sa clôture, dans la même
 * transaction. Une journée clôturée avant que ce mécanisme n'existe — ou
 * pendant qu'un déploiement servait encore l'ancien code — reste donc muette
 * pour toujours : rien ne repasse derrière. Cette commande est ce « derrière ».
 *
 * Elle est volontairement SANS surprise :
 *
 *  - idempotente — une journée déjà créditée est ignorée, l'index unique du
 *    ledger attrape même une course ; la relancer dix fois n'écrit rien de plus ;
 *  - bornée — les journées antérieures à WALLET_START_DATE sont ignorées,
 *    exactement comme à la clôture. Ce n'est PAS un backfill des anciens mois,
 *    et elle ne le deviendra pas ;
 *  - fidèle — le montant est le `net_result` du rapport de clôture figé, le
 *    même chiffre que celui des Rapports. Les vieux instantanés qui ne le
 *    portent pas sont recalculés par le même code que l'écran ;
 *  - lisible — chaque journée est listée avec ce qui a été fait, et
 *    `--dry-run` montre tout sans rien écrire.
 */
class SyncClosedWorkDaysToWallet extends Command
{
    protected $signature = 'wallet:sync-closed-days
                            {--dry-run : Montre ce qui serait crédité, sans rien écrire}';

    protected $description = 'Crédite au portefeuille les journées clôturées qui ne l\'ont jamais été';

    public function handle(WalletService $wallets, WorkDayService $workDays): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $startDate = $wallets->startDate()->toDateString();

        $days = WorkDay::with('openedBy')
            ->where('status', 'closed')
            ->where('date', '>=', $startDate)
            ->orderBy('date')
            ->get();

        if ($days->isEmpty()) {
            $this->info("Aucune journée clôturée depuis le {$startDate} — rien à faire.");

            return self::SUCCESS;
        }

        $credited = 0;

        foreach ($days as $day) {
            $label = $day->date->format('d/m/Y');

            if ($wallets->workDayCredit($day) !== null) {
                $this->line("  {$label} : déjà créditée — ignorée.");

                continue;
            }

            // Le rapport figé d'abord ; recalculé par le même code que les
            // écrans quand un vieil instantané ne porte pas encore net_result.
            $net = $day->closing_report['net_result']
                ?? $workDays->buildClosingReport($day)['net_result'];
            $net = round((float) $net, 2);

            if ($net == 0.0) {
                $this->line("  {$label} : résultat nul — rien à créditer.");

                continue;
            }

            if ($day->opened_by_user_id === null) {
                // Sans responsable, impossible de savoir quel portefeuille
                // créditer — et l'inventer serait pire que l'omission.
                $this->warn("  {$label} : aucun responsable (opened_by vide) — à régler par un ajustement Super Admin.");

                continue;
            }

            if ($dryRun) {
                $this->info(sprintf(
                    '  %s : créditerait %s DH au portefeuille de %s.',
                    $label,
                    number_format($net, 2, ',', ' '),
                    $day->openedBy->name ?? ('user #'.$day->opened_by_user_id),
                ));
                $credited++;

                continue;
            }

            $transaction = $wallets->creditWorkDayResult($day, $net);

            if ($transaction === null) {
                // creditWorkDayResult a ses propres raisons de refuser (hors
                // périmètre, course…) : les siennes priment, on le dit.
                $this->warn("  {$label} : non créditée (hors périmètre ou déjà traitée en parallèle).");

                continue;
            }

            $this->info(sprintf(
                '  %s : +%s DH → portefeuille de %s (mouvement #%d).',
                $label,
                number_format((float) $transaction->amount, 2, ',', ' '),
                $day->openedBy->name ?? ('user #'.$day->opened_by_user_id),
                $transaction->id,
            ));
            $credited++;
        }

        $this->newLine();
        $this->info($dryRun
            ? "{$credited} journée(s) seraient créditées. Relancez sans --dry-run pour écrire."
            : "{$credited} journée(s) créditée(s).");

        return self::SUCCESS;
    }
}
