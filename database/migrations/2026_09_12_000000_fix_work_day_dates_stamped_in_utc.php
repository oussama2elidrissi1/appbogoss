<?php

use App\Support\BusinessDay;
use Carbon\CarbonImmutable;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Repare les journees de caisse datees de la veille.
 *
 * `WorkDayService::openDay()` estampillait `date` avec `now()->toDateString()`,
 * donc avec le jour UTC. Le salon vit a Casablanca (UTC+1) : entre minuit et
 * 1h du matin, l'UTC est encore la veille. Une caisse ouverte a 00h30 le 11
 * etait enregistree au 10, et les rapports affichaient deux « journee du 10 »
 * au lieu de la journee du 10 et de celle du 11 — chacune avec son propre CA,
 * son propre fond de caisse et ses propres tickets, sans moyen de les
 * distinguer a l'ecran.
 *
 * Trois garde-fous, parce qu'une date de caisse est une donnee financiere :
 *
 * 1. On ne touche qu'aux lignes dont `date` est EXACTEMENT le jour UTC de
 *    `created_at`. C'est la signature de l'estampille automatique ; une date
 *    saisie ou corrigee a la main ne la porte pas et reste intacte.
 * 2. La conversion passe par Carbon et le vrai fuseau, pas par un « +1 heure »
 *    en dur : le Maroc repasse a UTC+0 pendant le Ramadan, et ces jours-la il
 *    n'y a rien a corriger.
 * 3. Une correction qui ferait changer une journee de MOIS est abandonnee si
 *    l'un des deux mois est deja cloture. Un mois clos ne se reecrit pas
 *    (MonthlyClosureService::assertPeriodOpen) ; ces rares journees sont
 *    laissees telles quelles et listees dans la sortie de la migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        $closedPeriods = DB::table('monthly_closures')->pluck('period')->flip();
        $moved = 0;
        $skipped = [];

        foreach (DB::table('work_days')->select('id', 'date', 'created_at')->orderBy('id')->cursor() as $row) {
            if ($row->created_at === null) {
                continue;
            }

            $createdUtc = CarbonImmutable::parse($row->created_at, 'UTC');
            $stampedDate = $createdUtc->toDateString();

            // Garde-fou 1 : seules les dates posees par l'estampille automatique.
            // `substr` parce que le pilote decide de la forme brute renvoyee :
            // MySQL rend « 2026-09-10 », SQLite « 2026-09-10 00:00:00 ».
            $currentDate = substr((string) $row->date, 0, 10);

            if ($currentDate !== $stampedDate) {
                continue;
            }

            // Garde-fou 2 : le vrai fuseau decide s'il y a decalage.
            $businessDate = $createdUtc->setTimezone(BusinessDay::timezone())->toDateString();

            if ($businessDate === $stampedDate) {
                continue;
            }

            // Garde-fou 3 : jamais dans ni hors d'un mois cloture.
            $fromPeriod = substr($stampedDate, 0, 7);
            $toPeriod = substr($businessDate, 0, 7);

            if ($fromPeriod !== $toPeriod && ($closedPeriods->has($fromPeriod) || $closedPeriods->has($toPeriod))) {
                $skipped[] = "#{$row->id} {$stampedDate} -> {$businessDate} (mois cloture)";

                continue;
            }

            DB::table('work_days')->where('id', $row->id)->update(['date' => $businessDate]);
            $moved++;
        }

        // Silencieuse quand il n'y a rien a corriger : cette migration tourne
        // aussi avant chaque test, sur une base vide.
        if ($moved > 0) {
            echo "Journees de caisse redatees : {$moved}".PHP_EOL;
        }

        foreach ($skipped as $line) {
            echo "Laissee en l'etat : {$line}".PHP_EOL;
        }
    }

    /**
     * Correction de donnees, pas de schema : il n'y a rien a defaire. Remettre
     * ces journees sur la veille reintroduirait exactement le bug corrige.
     */
    public function down(): void
    {
    }
};
