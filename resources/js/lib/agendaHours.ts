/**
 * Single source of truth for the salon's bookable hours, shared by the
 * staff/partner calendar (min/max bounds) and the partner wizard's
 * indicative slot grid — keeps both surfaces honest about the same window.
 *
 * Le salon ferme à MINUIT : 24 signifie « fin de journée ». Les grilles qui
 * ont besoin d'une Date le même jour passent par agendaCalendarMax(), qui
 * traduit 24 h en 23:59:59 — un max au lendemain casserait le calendrier.
 * Mêmes heures que le canal de réservation public (booking_close_time 00:00).
 */
export const AGENDA_OPEN_HOUR = 8;
export const AGENDA_CLOSE_HOUR = 24;
export const AGENDA_STEP_MINUTES = 15;

export function agendaCalendarMin(): Date {
    return new Date(1970, 0, 1, AGENDA_OPEN_HOUR, 0);
}

export function agendaCalendarMax(): Date {
    return AGENDA_CLOSE_HOUR >= 24
        ? new Date(1970, 0, 1, 23, 59, 59)
        : new Date(1970, 0, 1, AGENDA_CLOSE_HOUR, 0);
}
