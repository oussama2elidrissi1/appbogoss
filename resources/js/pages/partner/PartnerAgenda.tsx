import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarDays, List } from 'lucide-react';
import { Views, type View } from 'react-big-calendar';
import { getAppointments } from '@/lib/api';
import { cn } from '@/lib/utils';
import { pageFade } from '@/lib/motion';
import type { Appointment } from '@/types/workday';
import { Card, CardContent } from '@/components/ui/card';
import { AgendaCalendar } from '@/components/agenda/AgendaCalendar';
import { ReservationList } from '@/components/agenda/ReservationList';
import { ReservationDetailsDialog } from '@/components/agenda/ReservationDetailsDialog';

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

/** §3 — the partner's own calendar, reusing the same engine the staff Agenda uses. Read-only: viewing only, no drag/resize. */
export default function PartnerAgenda() {
    const navigate = useNavigate();
    const [view, setView] = useState<View>(Views.WEEK);
    const [date, setDate] = useState(() => new Date());
    const [displayMode, setDisplayMode] = useState<'calendar' | 'list'>('list');
    const [selected, setSelected] = useState<Appointment | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const { from, to } = useMemo(() => rangeFor(view, date), [view, date]);
    const fromKey = format(from, 'yyyy-MM-dd');
    const toKey = format(to, 'yyyy-MM-dd');

    const { data: appointments = [], isPending } = useQuery({
        queryKey: ['appointments', 'partner-agenda', fromKey, toKey],
        queryFn: () => getAppointments({ dateFrom: fromKey, dateTo: toKey }),
        refetchInterval: 30_000,
    });

    function openDetails(appointment: Appointment) {
        setSelected(appointment);
        setDetailsOpen(true);
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Mon agenda</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Toutes vos réservations, jour par jour — consultation uniquement.
                    </p>
                </div>

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
            </div>

            <Card className={cn('overflow-x-hidden', isPending && 'opacity-60')}>
                <CardContent className="p-4">
                    {displayMode === 'calendar' ? (
                        <AgendaCalendar
                            appointments={appointments}
                            employees={[]}
                            view={view}
                            date={date}
                            onViewChange={setView}
                            onDateChange={setDate}
                            onSelectSlot={() => navigate('/partner/reservations/new')}
                            onSelectEvent={openDetails}
                            onEventDrop={() => undefined}
                            onEventResize={() => undefined}
                        />
                    ) : (
                        <ReservationList
                            appointments={appointments}
                            view={view}
                            date={date}
                            onViewChange={setView}
                            onDateChange={setDate}
                            onSelect={openDetails}
                            partnerMode
                        />
                    )}
                </CardContent>
            </Card>

            <ReservationDetailsDialog
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
                appointment={selected}
                onEdit={() => navigate(`/partner/reservations/${selected?.id}`)}
            />
        </motion.div>
    );
}
