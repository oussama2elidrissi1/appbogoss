import { dateFnsLocalizer } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';

export const agendaLocalizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { locale: fr }),
    getDay,
    locales: { fr },
});

export const AGENDA_MESSAGES = {
    date: 'Date',
    time: 'Heure',
    event: 'Réservation',
    allDay: 'Journée',
    week: 'Semaine',
    work_week: 'Semaine travaillée',
    day: 'Jour',
    month: 'Mois',
    previous: 'Précédent',
    next: 'Suivant',
    yesterday: 'Hier',
    tomorrow: 'Demain',
    today: "Aujourd'hui",
    agenda: 'Agenda',
    noEventsInRange: 'Aucune réservation sur cette période.',
    showMore: (total: number) => `+${total} de plus`,
};
