import { AGENDA_CLOSE_HOUR, AGENDA_OPEN_HOUR } from './agendaHours';

/**
 * Pure, client-side grid of time-of-day slots within the salon's bookable
 * hours — deliberately NOT a real availability check. Nothing on the
 * backend tracks working hours or resource capacity today, and building a
 * fake "qualified employee" query would promise a guarantee the system
 * can't back up. This is indicative only: BOGOSLAND confirms real
 * availability when it processes the request.
 */
export function generateIndicativeSlots(dateIso: string, stepMinutes = 30): string[] {
    if (!dateIso) return [];

    const now = new Date();
    const isToday = dateIso === toIsoDate(now);
    const slots: string[] = [];

    for (let minutes = AGENDA_OPEN_HOUR * 60; minutes < AGENDA_CLOSE_HOUR * 60; minutes += stepMinutes) {
        if (isToday && minutes <= now.getHours() * 60 + now.getMinutes()) continue;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        slots.push(`${pad(hours)}:${pad(mins)}`);
    }

    return slots;
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function toIsoDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
