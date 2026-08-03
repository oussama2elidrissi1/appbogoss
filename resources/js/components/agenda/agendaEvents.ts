import type { Appointment, AppointmentStatus, ReservationItem } from '@/types/workday';

export const UNASSIGNED_RESOURCE_ID = 'unassigned';

export interface AgendaResource {
    id: number | typeof UNASSIGNED_RESOURCE_ID;
    name: string;
    avatarColor: string | null;
}

export interface AgendaEvent {
    id: string;
    appointmentId: number;
    resourceId: number | typeof UNASSIGNED_RESOURCE_ID;
    title: string;
    start: Date;
    end: Date;
    status: AppointmentStatus;
    color: string;
    clientNames: string;
    serviceNames: string;
    /** True when the parent reservation spans more than one resource column (parallel staff) — drag/resize is disabled to avoid an ambiguous partial edit. */
    isMulti: boolean;
    appointment: Appointment;
}

export function itemsOf(appointment: Appointment): ReservationItem[] {
    if (appointment.reservation_items?.length) return appointment.reservation_items;

    return [
        {
            service_id: appointment.service_id,
            employee_id: appointment.employee_id,
            service: appointment.service,
            employee: appointment.employee,
        },
    ];
}

export function buildAgendaEvents(appointments: Appointment[]): AgendaEvent[] {
    const events: AgendaEvent[] = [];

    for (const appointment of appointments) {
        const items = itemsOf(appointment);
        const groups = new Map<string, ReservationItem[]>();

        for (const item of items) {
            const key = item.employee_id ? String(item.employee_id) : UNASSIGNED_RESOURCE_ID;
            const bucket = groups.get(key);
            if (bucket) bucket.push(item);
            else groups.set(key, [item]);
        }

        const isMulti = groups.size > 1;
        const start = new Date(appointment.starts_at);
        const clientNames = (
            appointment.clients?.length
                ? appointment.clients
                : appointment.client
                  ? [appointment.client]
                  : []
        )
            .map((client) => client.name)
            .join(', ');

        groups.forEach((groupItems, key) => {
            const duration = groupItems.reduce(
                (sum, item) => sum + (item.service?.duration_minutes ?? 0),
                0,
            );
            const end = new Date(start.getTime() + Math.max(duration, 15) * 60_000);
            const serviceNames = groupItems
                .map((item) => item.service?.name)
                .filter(Boolean)
                .join(' · ');

            events.push({
                id: `${appointment.id}:${key}`,
                appointmentId: appointment.id,
                resourceId: key === UNASSIGNED_RESOURCE_ID ? UNASSIGNED_RESOURCE_ID : Number(key),
                title: serviceNames || 'Réservation',
                start,
                end,
                status: appointment.status,
                color: groupItems[0]?.service?.color ?? '#C8A24C',
                clientNames,
                serviceNames,
                isMulti,
                appointment,
            });
        });
    }

    return events;
}
