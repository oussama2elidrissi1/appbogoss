import { useMemo, useState } from 'react';
import { Views, type View } from 'react-big-calendar';
import { addDays, addMonths, addWeeks, format, isSameDay, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarX2, ChevronLeft, ChevronRight, Handshake, Phone, Users } from 'lucide-react';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import type { Appointment, AppointmentStatus } from '@/types/workday';
import { itemsOf } from './agendaEvents';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const STATUS_META: Record<AppointmentStatus, { label: string; variant: BadgeProps['variant'] }> = {
    pending: { label: 'En attente', variant: 'default' },
    confirmed: { label: 'Confirmé', variant: 'accent' },
    completed: { label: 'Terminé', variant: 'success' },
    cancelled: { label: 'Annulé', variant: 'destructive' },
    no_show: { label: 'Absent', variant: 'destructive' },
    refused: { label: 'Refusé', variant: 'destructive' },
};

const STATUS_FILTERS: Array<{ value: AppointmentStatus | 'all'; label: string }> = [
    { value: 'all', label: 'Toutes' },
    { value: 'pending', label: 'En attente' },
    { value: 'confirmed', label: 'Confirmées' },
    { value: 'completed', label: 'Terminées' },
    { value: 'cancelled', label: 'Annulées' },
];

const VIEW_LABELS: Array<{ value: View; label: string }> = [
    { value: Views.DAY, label: 'Jour' },
    { value: Views.WEEK, label: 'Semaine' },
    { value: Views.MONTH, label: 'Mois' },
];

function rangeLabel(view: View, date: Date): string {
    if (view === Views.MONTH) return format(date, 'MMMM yyyy', { locale: fr });
    if (view === Views.WEEK) {
        const start = addDays(date, -((date.getDay() + 6) % 7));
        const end = addDays(start, 6);
        return `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`;
    }
    return format(date, 'EEEE d MMMM yyyy', { locale: fr });
}

function shiftDate(view: View, date: Date, direction: 1 | -1): Date {
    if (view === Views.MONTH) return addMonths(date, direction);
    if (view === Views.WEEK) return addWeeks(date, direction);
    return addDays(date, direction);
}

interface ReservationListProps {
    appointments: Appointment[];
    view: View;
    date: Date;
    onViewChange: (view: View) => void;
    onDateChange: (date: Date) => void;
    onSelect: (appointment: Appointment) => void;
    /** Partner accounts: hide employee names, show their commission instead. */
    partnerMode?: boolean;
}

/** Chronological list of the reservations in the visible range, grouped by day. */
export function ReservationList({
    appointments,
    view,
    date,
    onViewChange,
    onDateChange,
    onSelect,
    partnerMode = false,
}: ReservationListProps) {
    const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');

    const days = useMemo(() => {
        const filtered = [...appointments]
            .filter((appointment) => statusFilter === 'all' || appointment.status === statusFilter)
            .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

        const groups: Array<{ day: Date; items: Appointment[] }> = [];
        filtered.forEach((appointment) => {
            const startsAt = new Date(appointment.starts_at);
            const group = groups.find((entry) => isSameDay(entry.day, startsAt));
            if (group) group.items.push(appointment);
            else groups.push({ day: startsAt, items: [appointment] });
        });
        return groups;
    }, [appointments, statusFilter]);

    return (
        <div>
            {/* Toolbar — mirrors the calendar's */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => onDateChange(shiftDate(view, date, -1))}
                        aria-label="Période précédente"
                    >
                        <ChevronLeft />
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onDateChange(new Date())}>
                        Aujourd'hui
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => onDateChange(shiftDate(view, date, 1))}
                        aria-label="Période suivante"
                    >
                        <ChevronRight />
                    </Button>
                    <span className="ml-2 text-sm font-semibold capitalize text-foreground">
                        {rangeLabel(view, date)}
                    </span>
                </div>

                <div className="flex items-center gap-1 rounded-md border border-tint/[0.08] bg-tint/[0.03] p-1">
                    {VIEW_LABELS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onViewChange(option.value)}
                            className={cn(
                                'rounded-sm px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                                view === option.value
                                    ? 'bg-accent text-accent-foreground shadow-soft'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Status filter */}
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
                {STATUS_FILTERS.map((filter) => (
                    <button
                        key={filter.value}
                        type="button"
                        onClick={() => setStatusFilter(filter.value)}
                        className={cn(
                            'rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200',
                            statusFilter === filter.value
                                ? 'border-accent/60 bg-accent/[0.12] text-foreground'
                                : 'border-tint/[0.08] bg-tint/[0.02] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                        )}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {days.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-tint/[0.08] px-6 py-16 text-center">
                    <CalendarX2 className="h-6 w-6 text-muted-foreground/60" />
                    <p className="mt-3 text-sm font-medium text-foreground">Aucune réservation</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Aucune réservation{statusFilter !== 'all' ? ' avec ce statut' : ''} sur cette période.
                    </p>
                </div>
            ) : (
                <div className="space-y-5">
                    {days.map((group) => (
                        <div key={group.day.toISOString()}>
                            <div className="mb-2 flex items-center gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    {format(group.day, 'EEEE d MMMM', { locale: fr })}
                                </p>
                                {isToday(group.day) && (
                                    <Badge variant="accent" className="px-1.5 py-0 text-[10px]">
                                        Aujourd'hui
                                    </Badge>
                                )}
                                <span className="text-xs text-muted-foreground/60">
                                    {group.items.length} réservation{group.items.length > 1 ? 's' : ''}
                                </span>
                            </div>

                            <div className="space-y-2">
                                {group.items.map((appointment) => {
                                    const items = itemsOf(appointment);
                                    const status = STATUS_META[appointment.status] ?? STATUS_META.pending;
                                    const contact =
                                        appointment.client ??
                                        appointment.clients?.find((client) => client.id === appointment.client_id) ??
                                        appointment.clients?.[0] ??
                                        null;
                                    const peopleCount = appointment.people?.length
                                        ?? appointment.client_ids?.length
                                        ?? 1;
                                    const totalPrice = items.reduce(
                                        (sum, item) => sum + (item.service?.price ?? 0),
                                        0,
                                    );
                                    const employeeNames = [
                                        ...new Set(
                                            items
                                                .map((item) => item.employee?.name)
                                                .filter((name): name is string => Boolean(name)),
                                        ),
                                    ];
                                    const cancelled =
                                        appointment.status === 'cancelled' ||
                                        appointment.status === 'no_show' ||
                                        appointment.status === 'refused';

                                    return (
                                        <button
                                            key={appointment.id}
                                            type="button"
                                            onClick={() => onSelect(appointment)}
                                            className={cn(
                                                'flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-tint/[0.08] bg-tint/[0.02] px-4 py-3 text-left transition-colors duration-200 hover:border-accent/30 hover:bg-tint/[0.05]',
                                                cancelled && 'opacity-60',
                                            )}
                                        >
                                            {/* Time */}
                                            <div className="w-24 shrink-0">
                                                <p className="text-sm font-semibold tabular-nums text-foreground">
                                                    {formatTime(appointment.starts_at)}
                                                </p>
                                                <p className="text-xs tabular-nums text-muted-foreground">
                                                    → {formatTime(appointment.ends_at)}
                                                </p>
                                            </div>

                                            {/* Contact + people */}
                                            <div className="min-w-[9rem] flex-1">
                                                <p className={cn('truncate text-sm font-medium text-foreground', cancelled && 'line-through')}>
                                                    {contact?.name ?? 'Client'}
                                                </p>
                                                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                                    {contact?.phone && (
                                                        <span className="flex items-center gap-1">
                                                            <Phone className="h-3 w-3" />
                                                            {contact.phone}
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <Users className="h-3 w-3" />
                                                        {peopleCount} personne{peopleCount > 1 ? 's' : ''}
                                                    </span>
                                                </p>
                                            </div>

                                            {/* Services */}
                                            <div className="flex min-w-0 flex-[1.4] flex-wrap items-center gap-1.5">
                                                {items.slice(0, 4).map((item, index) => (
                                                    <span
                                                        key={`${item.service_id}-${index}`}
                                                        className="flex max-w-[11rem] items-center gap-1.5 rounded-full border border-tint/[0.08] bg-tint/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground"
                                                    >
                                                        <span
                                                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                                                            style={{ backgroundColor: item.service?.color ?? '#C8A24C' }}
                                                        />
                                                        <span className="truncate">{item.service?.name ?? 'Prestation'}</span>
                                                    </span>
                                                ))}
                                                {items.length > 4 && (
                                                    <span className="text-[11px] text-muted-foreground/70">
                                                        +{items.length - 4}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Staff / partner info */}
                                            {!partnerMode && (
                                                <div className="hidden w-32 shrink-0 lg:block">
                                                    {appointment.partner ? (
                                                        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                                                            <Handshake className="h-3 w-3 shrink-0 text-accent" />
                                                            {appointment.partner.name}
                                                        </p>
                                                    ) : (
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {employeeNames.length > 0
                                                                ? employeeNames.join(', ')
                                                                : 'Non assigné'}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Amounts */}
                                            <div className="w-24 shrink-0 text-right">
                                                <p className="text-sm font-semibold tabular-nums text-accent">
                                                    {formatCurrency(totalPrice, { maximumFractionDigits: 2 })}
                                                </p>
                                                {partnerMode &&
                                                    appointment.partner_commission != null &&
                                                    appointment.partner_commission > 0 && (
                                                        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                                            Commission{' '}
                                                            {formatCurrency(appointment.partner_commission, {
                                                                maximumFractionDigits: 2,
                                                            })}
                                                        </p>
                                                    )}
                                            </div>

                                            <Badge variant={status.variant} className="shrink-0">
                                                {status.label}
                                            </Badge>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
