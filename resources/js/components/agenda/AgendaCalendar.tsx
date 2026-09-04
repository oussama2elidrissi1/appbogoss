import { useMemo } from 'react';
import { Calendar, Views, type ToolbarProps as RbcToolbarProps, type View } from 'react-big-calendar';
import withDragAndDrop, { type EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import { ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { agendaCulture, agendaLocalizer, agendaMessages } from './agendaLocalizer';
import { buildAgendaEvents, UNASSIGNED_RESOURCE_ID, type AgendaEvent, type AgendaResource } from './agendaEvents';
import { useI18n } from '@/lib/i18n';
import { cn, formatTime } from '@/lib/utils';
import { AGENDA_STEP_MINUTES, agendaCalendarMax, agendaCalendarMin } from '@/lib/agendaHours';
import { Button } from '@/components/ui/button';
import type { Appointment, Employee } from '@/types/workday';

const DnDCalendar = withDragAndDrop<AgendaEvent, AgendaResource>(Calendar);

const STATUS_DIM: Record<string, boolean> = {
    cancelled: true,
    no_show: true,
    refused: true,
};

interface AgendaCalendarProps {
    appointments: Appointment[];
    employees: Employee[];
    view: View;
    date: Date;
    onViewChange: (view: View) => void;
    onDateChange: (date: Date) => void;
    onSelectSlot: (start: Date, end: Date, resourceId: number | typeof UNASSIGNED_RESOURCE_ID) => void;
    onSelectEvent: (appointment: Appointment) => void;
    onEventDrop: (args: EventInteractionArgs<AgendaEvent>) => void;
    onEventResize: (args: EventInteractionArgs<AgendaEvent>) => void;
}

export function AgendaCalendar({
    appointments,
    employees,
    view,
    date,
    onViewChange,
    onDateChange,
    onSelectSlot,
    onSelectEvent,
    onEventDrop,
    onEventResize,
}: AgendaCalendarProps) {
    const resources = useMemo<AgendaResource[]>(
        () => [
            ...employees.map((employee) => ({
                id: employee.id,
                name: employee.name,
                avatarColor: employee.avatar_color,
            })),
            { id: UNASSIGNED_RESOURCE_ID, name: 'Non assigné', avatarColor: null },
        ],
        [employees],
    );

    const { lang: uiLang } = useI18n();
    const messages = useMemo(() => agendaMessages(uiLang), [uiLang]);
    const events = useMemo(() => buildAgendaEvents(appointments), [appointments]);
    // Resource-per-column only makes sense in Day view — tiling every employee across
    // a full week/month would multiply the date range by the employee count and become unreadable.
    const showResources = view === Views.DAY;

    return (
        <div className="agenda-calendar h-[calc(100vh-19rem)] min-h-[520px]">
            <DnDCalendar
                localizer={agendaLocalizer}
                culture={agendaCulture(uiLang)}
                messages={messages}
                events={events}
                resources={showResources ? resources : undefined}
                resourceIdAccessor="id"
                resourceTitleAccessor="name"
                view={view}
                onView={onViewChange}
                date={date}
                onNavigate={onDateChange}
                views={[Views.DAY, Views.WEEK, Views.MONTH]}
                step={AGENDA_STEP_MINUTES}
                timeslots={4}
                min={agendaCalendarMin()}
                max={agendaCalendarMax()}
                selectable
                popup
                resizable
                onSelectSlot={(slot) =>
                    onSelectSlot(
                        slot.start as Date,
                        slot.end as Date,
                        (slot.resourceId as number | undefined) ?? UNASSIGNED_RESOURCE_ID,
                    )
                }
                onSelectEvent={(event) => onSelectEvent(event.appointment)}
                onEventDrop={onEventDrop}
                onEventResize={onEventResize}
                draggableAccessor={(event) => !event.isMulti}
                resizableAccessor={(event) => !event.isMulti}
                eventPropGetter={(event) => ({
                    className: cn(STATUS_DIM[event.status] && 'agenda-event--dimmed'),
                    style: {
                        backgroundColor: `${event.color}2e`,
                        borderColor: `${event.color}80`,
                        color: 'inherit',
                    },
                })}
                components={{
                    event: EventCard,
                    resourceHeader: ResourceHeader,
                    toolbar: AgendaToolbar,
                }}
            />
        </div>
    );
}

function EventCard({ event }: { event: AgendaEvent }) {
    const { t } = useI18n();
    return (
        <div className="flex h-full flex-col overflow-hidden px-0.5 py-0.5 text-left leading-tight">
            <span className="truncate text-[11px] font-semibold">
                {formatTime(event.start.toISOString())} · {event.clientNames || t('Client')}
            </span>
            <span className="truncate text-[11px] opacity-80">{event.serviceNames}</span>
            {event.isMulti && (
                <span className="truncate text-[10px] opacity-70">{t('Réservation multi-employés')}</span>
            )}
        </div>
    );
}

function ResourceHeader({ resource }: { resource: AgendaResource }) {
    const { t } = useI18n();
    return (
        <div className="flex items-center justify-center gap-1.5 py-1">
            {resource.id === UNASSIGNED_RESOURCE_ID ? (
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
                <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: resource.avatarColor ?? '#C8A24C' }}
                />
            )}
            <span className="truncate text-xs font-medium text-foreground">
                {resource.id === UNASSIGNED_RESOURCE_ID ? t('Non assigné') : resource.name}
            </span>
        </div>
    );
}

const VIEW_LABELS: Record<string, string> = {
    [Views.DAY]: 'Jour',
    [Views.WEEK]: 'Semaine',
    [Views.MONTH]: 'Mois',
};

/** At runtime `views` is the array we passed to `<Calendar views={...}>` — the
 * library's type only models the "enabled-view flags" object shape, so normalize both. */
function normalizeViews(views: RbcToolbarProps<AgendaEvent, AgendaResource>['views']): View[] {
    if (Array.isArray(views)) return views;
    return Object.entries(views)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([name]) => name as View);
}

function AgendaToolbar({ label, view, views, onNavigate, onView }: RbcToolbarProps<AgendaEvent, AgendaResource>) {
    const { t } = useI18n();
    const viewOptions = normalizeViews(views);
    return (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="icon" onClick={() => onNavigate('PREV')} aria-label={t('Période précédente')}>
                    <ChevronLeft />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onNavigate('TODAY')}>
                    {t("Aujourd'hui")}
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => onNavigate('NEXT')} aria-label={t('Période suivante')}>
                    <ChevronRight />
                </Button>
                <span className="ml-2 text-sm font-semibold capitalize text-foreground">{label}</span>
            </div>

            <div className="flex items-center gap-1 rounded-md border border-tint/[0.08] bg-tint/[0.03] p-1">
                {viewOptions.map((viewOption) => (
                    <button
                        key={viewOption}
                        type="button"
                        onClick={() => onView(viewOption)}
                        className={cn(
                            'rounded-sm px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                            view === viewOption
                                ? 'bg-accent text-accent-foreground shadow-soft'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {t(VIEW_LABELS[viewOption] ?? viewOption)}
                    </button>
                ))}
            </div>
        </div>
    );
}
