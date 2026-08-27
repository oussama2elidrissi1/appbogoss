import { dateFnsLocalizer } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek } from 'date-fns';
import { arMA, fr } from 'date-fns/locale';
import { translate, type Lang } from '@/lib/i18n';

export const agendaLocalizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { locale: fr }),
    getDay,
    locales: { fr, ar: arMA },
});

/** Culture react-big-calendar (noms de jours/mois via date-fns) selon la langue de l'interface. */
export function agendaCulture(lang: Lang): 'fr' | 'ar' {
    return lang === 'ar' ? 'ar' : 'fr';
}

/**
 * Libellés du calendrier (vues, navigation, « +N de plus »…) pour une langue
 * donnée — recalculés par le composant à chaque changement de langue, sans
 * rechargement de page.
 */
export function agendaMessages(lang: Lang) {
    const tr = (text: string) => translate(text, lang);
    return {
        date: tr('Date'),
        time: tr('Heure'),
        event: tr('Réservation'),
        allDay: tr('Journée'),
        week: tr('Semaine'),
        work_week: tr('Semaine travaillée'),
        day: tr('Jour'),
        month: tr('Mois'),
        previous: tr('Précédent'),
        next: tr('Suivant'),
        yesterday: tr('Hier'),
        tomorrow: tr('Demain'),
        today: tr("Aujourd'hui"),
        agenda: tr('Agenda'),
        noEventsInRange: tr('Aucune réservation sur cette période.'),
        showMore: (total: number) => tr('+{n} de plus').replace('{n}', String(total)),
    };
}
