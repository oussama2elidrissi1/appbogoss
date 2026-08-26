import { dateFnsLocalizer } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { t } from '@/lib/i18n';

export const agendaLocalizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { locale: fr }),
    getDay,
    locales: { fr },
});

// Message table built once at module load: the calendar chrome (view names,
// navigation, "+N de plus"…) picks up the language active at startup, so a
// language switch needs a page reload for these labels (accepted).
export const AGENDA_MESSAGES = {
    date: t('Date'),
    time: t('Heure'),
    event: t('Réservation'),
    allDay: t('Journée'),
    week: t('Semaine'),
    work_week: t('Semaine travaillée'),
    day: t('Jour'),
    month: t('Mois'),
    previous: t('Précédent'),
    next: t('Suivant'),
    yesterday: t('Hier'),
    tomorrow: t('Demain'),
    today: t("Aujourd'hui"),
    agenda: t('Agenda'),
    noEventsInRange: t('Aucune réservation sur cette période.'),
    showMore: (total: number) => t('+{n} de plus', { n: total }),
};
