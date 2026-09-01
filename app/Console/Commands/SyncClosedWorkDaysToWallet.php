<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Models\WalletTransaction;
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
                            {--dry-run : Montre ce qui serait fait, sans rien écrire}
                            {--repair-owners : Réattribue les résultats crédités au patron alors qu\'un admin tenait la caisse}';

    protected $description = 'Crédite au portefeuille les journées clôturées qui ne l\'ont jamais été';

    public function handle(WalletService $wallets, WorkDayService $workDays): int
    {
        $dryRun = (bool) $this->option('dry-run');

        if ($this->option('repair-owners')) {
            return $this->repairOwners($wallets, $dryRun);
        }

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

    /**
     * Réattribue les résultats de caisse crédités au patron par accident.
     *
     * Le cas : une journée ouverte avec le compte Super Admin (habitude,
     * test) mais tenue et clôturée par un admin — l'ancienne règle créditait
     * l'ouvreur, donc le patron. L'argent était chez l'admin, le ledger disait
     * le contraire.
     *
     * La réparation respecte le ledger : rien n'est modifié ni supprimé. Le
     * crédit fautif est CONTRE-PASSÉ chez le patron, et un AJUSTEMENT du même
     * montant est écrit chez l'admin, chacun portant son motif. La journée
     * s'affichera « crédit contre-passé » dans les Rapports — c'est exact, et
     * les deux historiques racontent toute l'histoire.
     *
     * L'admin cible est le premier non-super-admin entre l'ouvreur de la
     * journée et l'auteur du mouvement (celui qui a clôturé). Une journée
     * entièrement tenue par le patron n'est pas touchée : son portefeuille
     * était le bon.
     */
    private function repairOwners(WalletService $wallets, bool $dryRun): int
    {
        $credits = WalletTransaction::with(['wallet.user', 'performedBy', 'source'])
            ->where('type', WalletTransaction::TYPE_CASH_REGISTER_RESULT)
            ->orderBy('id')
            ->get();

        $repaired = 0;

        foreach ($credits as $credit) {
            $day = $credit->source;
            $label = $day instanceof WorkDay
                ? $day->date->format('d/m/Y')
                : ('mouvement #'.$credit->id);

            if (WalletTransaction::where('reverses_transaction_id', $credit->id)->exists()) {
                $this->line("  {$label} : déjà contre-passé — ignoré.");

                continue;
            }

            $holder = $credit->wallet?->user;

            if ($holder === null || ! $holder->hasRole('super-admin')) {
                continue; // bien placé, rien à faire
            }

            $target = collect([
                $day instanceof WorkDay ? $day->openedBy : null,
                $credit->performedBy,
            ])->first(fn (?User $user) => $user !== null && ! $user->hasRole('super-admin'));

            if ($target === null) {
                $this->warn("  {$label} : journée entièrement tenue par le patron — son portefeuille est le bon, ignoré.");

                continue;
            }

            $amount = $credit->signedAmount();

            if ($dryRun) {
                $this->info(sprintf(
                    '  %s : déplacerait %s DH du portefeuille de %s vers celui de %s.',
                    $label,
                    number_format(abs($amount), 2, ',', ' '),
                    $holder->name,
                    $target->name,
                ));
                $repaired++;

                continue;
            }

            $wallets->reverse(
                $credit,
                $holder,
                'Résultat de caisse crédité au portefeuille du patron par erreur',
            );

            $wallets->adjust(
                $wallets->walletFor($target),
                $amount,
                sprintf(
                    'Réattribution du résultat de caisse du %s (crédité à tort au portefeuille du patron)',
                    $label,
                ),
                $holder,
            );

            $this->info(sprintf(
                '  %s : %s DH déplacés de %s vers %s.',
                $label,
                number_format(abs($amount), 2, ',', ' '),
                $holder->name,
                $target->name,
            ));
            $repaired++;
        }

        $this->newLine();
        $this->info($dryRun
            ? "{$repaired} crédit(s) seraient réattribués. Relancez sans --dry-run pour écrire."
            : "{$repaired} crédit(s) réattribué(s).");

        return self::SUCCESS;
    }
}
