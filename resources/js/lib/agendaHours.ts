/**
 * Single source of truth for the salon's bookable hours, shared by the
 * staff/partner calendar (min/max bounds) and the partner wizard's
 * indicative slot grid — keeps both surfaces honest about the same window.
 */
export const AGENDA_OPEN_HOUR = 8;
export const AGENDA_CLOSE_HOUR = 21;
export const AGENDA_STEP_MINUTES = 15;
