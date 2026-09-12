<?php

namespace App\Support;

use Carbon\Carbon;
use Carbon\CarbonImmutable;
use DateTimeInterface;

/**
 * La DATE METIER du salon, distincte de l'horodatage de stockage.
 *
 * L'application stocke tous ses horodatages en UTC (`config/app.php`) et le
 * navigateur les reconvertit a l'affichage : c'est correct, et il ne faut
 * surtout pas y toucher — changer le fuseau de l'application relirait tout
 * l'historique deja enregistre avec une heure de decalage.
 *
 * Mais une date metier n'est pas un horodatage : c'est le jour du calendrier
 * tel que le salon le vit, a Casablanca. Entre minuit et 1h du matin, l'UTC
 * est encore la veille. Une journee de caisse ouverte a 00h30 etait donc
 * enregistree au jour precedent : les rapports affichaient deux « journee du
 * 10 » au lieu de la journee du 10 et celle du 11.
 *
 * Toute date qui designe un jour de travail — `work_days.date`,
 * `expenses.spent_on`, `advances.given_on` — passe par ici. Les dates saisies
 * par l'utilisateur, elles, arrivent deja dans son fuseau local et sont
 * conservees telles quelles.
 */
final class BusinessDay
{
    /** Repli quand la configuration ne dit rien : le salon est a Casablanca. */
    public const DEFAULT_TIMEZONE = 'Africa/Casablanca';

    public static function timezone(): string
    {
        $configured = config('app.business_timezone');

        return is_string($configured) && $configured !== '' ? $configured : self::DEFAULT_TIMEZONE;
    }

    /**
     * L'instant present, lu dans le fuseau du salon.
     *
     * Passe par `Carbon::now()` — et non `CarbonImmutable::now()` — parce que
     * c'est la seule horloge que `Carbon::setTestNow()` et `travelTo()`
     * pilotent : les deux classes gardent chacune leur propre heure de test.
     */
    public static function now(): CarbonImmutable
    {
        return CarbonImmutable::instance(Carbon::now())->setTimezone(self::timezone());
    }

    /** Le jour de travail en cours, au format `Y-m-d`. */
    public static function today(): string
    {
        return self::now()->toDateString();
    }

    /** Le jour de travail auquel appartient un horodatage stocke (UTC). */
    public static function of(DateTimeInterface|string $moment): string
    {
        return CarbonImmutable::parse($moment)
            ->setTimezone(self::timezone())
            ->toDateString();
    }
}
