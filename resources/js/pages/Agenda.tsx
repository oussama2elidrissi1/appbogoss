import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Views, type View } from 'react-big-calendar';
import type { EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import {
    endOfMonth,
    endOfWeek,
    format,
    startOfDay,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarDays, CalendarPlus, List } from 'lucide-react';
import { getAppointments, getEmployees, getServices, updateAppointment } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { pageFade } from '@/lib/motion';
import type { Appointment } from '@/types/workday';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AgendaCalendar } from '@/components/agenda/AgendaCalendar';
import { ReservationDialog } from '@/components/agenda/ReservationDialog';
import { ReservationDetailsDialog } from '@/components/agenda/ReservationDetailsDialog';
import { ReservationList } from '@/components/agenda/ReservationList';
import { itemsOf, UNASSIGNED_RESOURCE_ID, type AgendaEvent } from '@/components/agenda/agendaEvents';

interface DialogState {
    open: boolean;
    mode: 'create' | 'edit' | 'view';
    appointment: Appointment | null;
    initialStart: Date | null;
    initialResourceId: number | typeof UNASSIGNED_RESOURCE_ID | null;
}

const CLOSED_DIALOG: DialogState = {
    open: false,
    mode: 'create',
    appointment: null,
    initialStart: null,
    initialResourceId: null,
};

function rangeFor(view: View, date: Date): { from: Date; to: Date } {
    if (view === Views.MONTH) {
        return {
            from: startOfWeek(startOfMonth(date), { locale: fr }),
            to: endOfWeek(endOfMonth(date), { locale: fr }),
        };
    }
    if (view === Views.WEEK) {
        return { from: startOfWeek(date, { locale: fr }), to: endOfWeek(date, { locale: fr }) };
    }
    return { from: startOfDay(date), to: startOfDay(date) };
}

export default function Agenda() {
    const queryClient = useQueryClient();
    const { hasPermission } = useAuth();
    // Partner accounts reach the agenda through `agenda.partner` only: they see
    // just their own reservations (server-scoped) and never assign employees.
    const partnerMode = !hasPermission('agenda.manage');
    const [view, setView] = useState<View>(Views.WEEK);
    const [date, setDate] = useState(() => new Date());
    // Partners live in list mode by default — their agenda is a booking log more
    // than a staff planning board.
    const [displayMode, setDisplayMode] = useState<'calendar' | 'list'>(partnerMode ? 'list' : 'calendar');
    const [dialog, setDialog] = useState<DialogState>(CLOSED_DIALOG);

    const { from, to } = useMemo(() => rangeFor(view, date), [view, date]);
    // Local calendar dates — toISOString() would shift a local midnight back one
    // day (UTC) and silently pull the previous day's reservations into the range.
    const fromKey = format(from, 'yyyy-MM-dd');
    const toKey = format(to, 'yyyy-MM-dd');
    const rangeKey = `${fromKey}_${toKey}`;

    const { data: appointments = [], isPending: appointmentsPending } = useQuery({
        queryKey: ['appointments', rangeKey],
        queryFn: () => getAppointments({ dateFrom: fromKey, dateTo: toKey }),
        refetchInterval: 30_000,
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', 'agenda'],
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
        // The employees endpoint requires employees.manage — partners don't have it.
        enabled: !partnerMode,
    });

    const { data: services = [] } = useQuery({
        queryKey: ['services', 'agenda', 'all'],
        queryFn: () => getServices(),
        staleTime: 5 * 60_000,
    });

    function invalidateAppointments() {
        void queryClient.invalidateQueries({ queryKey: ['appointments'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    const rescheduleMutation = useMutation({
        mutationFn: ({ id, next }: { id: number; next: Parameters<typeof updateAppointment>[1] }) =>
            updateAppointment(id, next),
        onSuccess: invalidateAppointments,
    });

    function openCreateDialog(start: Date, resourceId: number | typeof UNASSIGNED_RESOURCE_ID) {
        setDialog({ open: true, mode: 'create', appointment: null, initialStart: start, initialResourceId: resourceId });
    }

    function openViewDialog(appointment: Appointment) {
        setDialog({ open: true, mode: 'view', appointment, initialStart: null, initialResourceId: null });
    }

    function switchToEdit() {
        setDialog((current) => ({ ...current, mode: 'edit' }));
    }

    function handleEventDrop({ event, start, resourceId }: EventInteractionArgs<AgendaEvent>) {
        if (event.isMulti) return;

        const appointment = event.appointment;
        const newStart = start as Date;
        const targetResource = resourceId ?? event.resourceId;
        const resourceChanged = String(targetResource) !== String(event.resourceId);

        if (!resourceChanged) {
            rescheduleMutation.mutate({ id: appointment.id, next: { starts_at: newStart.toISOString() } });
            return;
        }

        const items = itemsOf(appointment).map((item) => ({
            service_id: item.service_id,
            employee_id: targetResource === UNASSIGNED_RESOURCE_ID ? null : Number(targetResource),
            person_index: item.person_index ?? 0,
        }));

        rescheduleMutation.mutate({
            id: appointment.id,
            next: {
                starts_at: newStart.toISOString(),
                items,
                duration_override_minutes: appointment.duration_override_minutes ?? undefined,
            },
        });
    }

    function handleEventResize({ event, start, end }: EventInteractionArgs<AgendaEvent>) {
        if (event.isMulti) return;

        const startDate = start as Date;
        const endDate = end as Date;
        const minutes = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60_000));

        rescheduleMutation.mutate({
            id: event.appointment.id,
            next: { starts_at: startDate.toISOString(), duration_override_minutes: minutes },
        });
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Agenda</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {partnerMode
                            ? 'Vos réservations partenaires — créez une réservation, le salon la confirme.'
                            : 'Planning professionnel du salon — glissez-déposez pour reprogrammer, redimensionnez pour ajuster la durée.'}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-md border border-tint/[0.08] bg-tint/[0.03] p-1">
                        {(
                            [
                                { value: 'calendar', label: 'Calendrier', icon: CalendarDays },
                                { value: 'list', label: 'Liste', icon: List },
                            ] as const
                        ).map((option) => {
                            const Icon = option.icon;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setDisplayMode(option.value)}
                                    className={cn(
                                        'flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                                        displayMode === option.value
                                            ? 'bg-accent text-accent-foreground shadow-soft'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>

                    <Button type="button" variant="accent" onClick={() => openCreateDialog(new Date(), UNASSIGNED_RESOURCE_ID)}>
                        <CalendarPlus />
                        Nouvelle réservation
                    </Button>
                </div>
            </div>

            <Card className={appointmentsPending ? 'opacity-60' : undefined}>
                <CardContent className="p-4">
                    {displayMode === 'calendar' ? (
                        <AgendaCalendar
                            appointments={appointments}
                            employees={employees.filter((employee) => employee.is_active)}
                            view={view}
                            date={date}
                            onViewChange={setView}
                            onDateChange={setDate}
                            onSelectSlot={(start, _end, resourceId) => openCreateDialog(start, resourceId)}
                            onSelectEvent={openViewDialog}
                            onEventDrop={handleEventDrop}
                            onEventResize={handleEventResize}
                        />
                    ) : (
                        <ReservationList
                            appointments={appointments}
                            view={view}
                            date={date}
                            onViewChange={setView}
                            onDateChange={setDate}
                            onSelect={openViewDialog}
                            partnerMode={partnerMode}
                        />
                    )}
                </CardContent>
            </Card>

            <ReservationDetailsDialog
                open={dialog.open && dialog.mode === 'view'}
                onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
                appointment={dialog.appointment}
                onEdit={switchToEdit}
            />

            <ReservationDialog
                open={dialog.open && dialog.mode !== 'view'}
                onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
                mode={dialog.mode === 'view' ? 'edit' : dialog.mode}
                appointment={dialog.appointment}
                initialStart={dialog.initialStart}
                initialResourceId={dialog.initialResourceId}
                employees={employees.filter((employee) => employee.is_active)}
                services={services}
                partnerMode={partnerMode}
            />
        </motion.div>
    );
}
