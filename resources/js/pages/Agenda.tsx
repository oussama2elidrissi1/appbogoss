import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarDays, CheckCircle2, Clock, Plus, Trash2, XCircle } from 'lucide-react';
import {
    createAppointment,
    createClient,
    deleteAppointment,
    getAppointments,
    getClients,
    getEmployees,
    getErrorMessage,
    getServices,
    updateAppointment,
} from '@/lib/api';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import type {
    Appointment,
    AppointmentPayload,
    AppointmentStatus,
} from '@/types/workday';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';

const statuses: Array<{ value: AppointmentStatus; label: string; variant: BadgeProps['variant'] }> = [
    { value: 'pending', label: 'En attente', variant: 'default' },
    { value: 'confirmed', label: 'Confirmé', variant: 'accent' },
    { value: 'completed', label: 'Terminé', variant: 'success' },
    { value: 'cancelled', label: 'Annulé', variant: 'destructive' },
    { value: 'no_show', label: 'Absent', variant: 'destructive' },
];

function today(): string {
    const date = new Date();
    return localDateInput(date);
}

function defaultStart(): string {
    const date = new Date();
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
    return `${localDateInput(date)}T${String(date.getHours()).padStart(2, '0')}:${String(
        date.getMinutes(),
    ).padStart(2, '0')}`;
}

function localDateInput(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function statusMeta(status: string) {
    return statuses.find((item) => item.value === status) ?? statuses[0];
}

function sameDayInput(dateTime: string): string {
    return dateTime.slice(0, 10);
}

export default function Agenda() {
    const queryClient = useQueryClient();
    const [date, setDate] = useState(today());
    const [clientSearch, setClientSearch] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [payload, setPayload] = useState<AppointmentPayload>({
        starts_at: defaultStart(),
        status: 'confirmed',
        notes: '',
    });

    const appointmentKey = ['appointments', date] as const;

    const { data: appointments, isPending: appointmentsPending } = useQuery({
        queryKey: appointmentKey,
        queryFn: () => getAppointments({ date }),
        refetchInterval: 10_000,
    });

    const { data: employees, isPending: employeesPending } = useQuery({
        queryKey: ['employees', 'agenda'],
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
    });

    const { data: services, isPending: servicesPending } = useQuery({
        queryKey: ['services', 'agenda'],
        queryFn: () => getServices(),
        staleTime: 5 * 60_000,
    });

    const { data: clients, isPending: clientsPending } = useQuery({
        queryKey: ['clients', clientSearch],
        queryFn: () => getClients(clientSearch),
        staleTime: 30_000,
    });

    const selectedService = useMemo(
        () => services?.find((service) => service.id === payload.service_id) ?? null,
        [services, payload.service_id],
    );

    const canSubmit =
        Boolean(payload.client_id) &&
        Boolean(payload.employee_id) &&
        Boolean(payload.service_id) &&
        Boolean(payload.starts_at);

    const createMutation = useMutation({
        mutationFn: createAppointment,
        onSuccess: (appointment) => {
            const key = ['appointments', sameDayInput(appointment.starts_at)] as const;
            queryClient.setQueryData<Appointment[]>(key, (current) =>
                current ? [...current, appointment].sort(sortAppointments) : [appointment],
            );
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setDate(sameDayInput(appointment.starts_at));
            setPayload({
                starts_at: defaultStart(),
                status: 'confirmed',
                notes: '',
                employee_id: payload.employee_id,
            });
            setClientSearch('');
            setClientPhone('');
        },
    });

    const createClientMutation = useMutation({
        mutationFn: createClient,
        onSuccess: (client) => {
            queryClient.setQueryData(['clients', clientSearch], (current: unknown) => {
                if (!Array.isArray(current)) return [client];
                return [client, ...current.filter((item) => item.id !== client.id)];
            });
            setPayload((current) => ({ ...current, client_id: client.id }));
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, next }: { id: number; next: AppointmentPayload }) =>
            updateAppointment(id, next),
        onSuccess: (appointment) => {
            queryClient.setQueryData<Appointment[]>(appointmentKey, (current) =>
                current?.map((item) => (item.id === appointment.id ? appointment : item)) ?? [
                    appointment,
                ],
            );
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteAppointment,
        onSuccess: (_, id) => {
            queryClient.setQueryData<Appointment[]>(appointmentKey, (current) =>
                current?.filter((appointment) => appointment.id !== id) ?? [],
            );
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
    });

    function submit() {
        if (!canSubmit || createMutation.isPending) return;
        createMutation.mutate(payload);
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Agenda</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Créez et suivez les réservations du salon.
                    </p>
                </div>

                <div className="w-full max-w-xs">
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Journée
                    </label>
                    <Input
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        className="mt-2"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
                <Card>
                    <CardHeader>
                        <CardTitle>Nouvelle réservation</CardTitle>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Sélectionnez le client, le service, l’employé et l’heure.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Field label="Client">
                            <Input
                                value={clientSearch}
                                onChange={(event) => setClientSearch(event.target.value)}
                                placeholder="Rechercher ou saisir un nom..."
                            />
                            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                <Input
                                    value={clientPhone}
                                    onChange={(event) => setClientPhone(event.target.value)}
                                    placeholder="Téléphone"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        clientSearch.trim().length < 2 ||
                                        createClientMutation.isPending
                                    }
                                    onClick={() =>
                                        createClientMutation.mutate({
                                            name: clientSearch.trim(),
                                            phone: clientPhone.trim() || null,
                                        })
                                    }
                                >
                                    <Plus />
                                    Client
                                </Button>
                            </div>
                            <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto">
                                {clientsPending ? (
                                    <Skeleton className="h-10 rounded-md" />
                                ) : (
                                    (clients ?? []).map((client) => (
                                        <PickerButton
                                            key={client.id}
                                            selected={payload.client_id === client.id}
                                            onClick={() =>
                                                setPayload((current) => ({
                                                    ...current,
                                                    client_id: client.id,
                                                }))
                                            }
                                        >
                                            <span className="truncate">{client.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {client.phone ?? 'Sans téléphone'}
                                            </span>
                                        </PickerButton>
                                    ))
                                )}
                            </div>
                        </Field>

                        {createClientMutation.isError && (
                            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                {getErrorMessage(createClientMutation.error)}
                            </div>
                        )}

                        <Field label="Service">
                            <select
                                value={payload.service_id ?? ''}
                                onChange={(event) =>
                                    setPayload((current) => ({
                                        ...current,
                                        service_id: Number(event.target.value) || undefined,
                                    }))
                                }
                                className={selectClass}
                                disabled={servicesPending}
                            >
                                <option value="">Choisir un service</option>
                                {(services ?? []).map((service) => (
                                    <option key={service.id} value={service.id}>
                                        {service.name} · {service.duration_minutes} min ·{' '}
                                        {formatCurrency(service.price)}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Employé">
                            <div className="grid grid-cols-2 gap-2">
                                {employeesPending ? (
                                    <Skeleton className="h-10 rounded-md" />
                                ) : (
                                    (employees ?? []).map((employee) => (
                                        <PickerButton
                                            key={employee.id}
                                            selected={payload.employee_id === employee.id}
                                            onClick={() =>
                                                setPayload((current) => ({
                                                    ...current,
                                                    employee_id: employee.id,
                                                }))
                                            }
                                        >
                                            <EmployeeAvatar
                                                name={employee.name}
                                                color={employee.avatar_color}
                                                size="sm"
                                            />
                                            <span className="truncate">{employee.name}</span>
                                        </PickerButton>
                                    ))
                                )}
                            </div>
                        </Field>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Date et heure">
                                <Input
                                    type="datetime-local"
                                    value={payload.starts_at ?? ''}
                                    onChange={(event) =>
                                        setPayload((current) => ({
                                            ...current,
                                            starts_at: event.target.value,
                                        }))
                                    }
                                />
                            </Field>
                            <Field label="Statut">
                                <select
                                    value={payload.status ?? 'confirmed'}
                                    onChange={(event) =>
                                        setPayload((current) => ({
                                            ...current,
                                            status: event.target.value as AppointmentStatus,
                                        }))
                                    }
                                    className={selectClass}
                                >
                                    {statuses.map((status) => (
                                        <option key={status.value} value={status.value}>
                                            {status.label}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </div>

                        <Field label="Notes">
                            <textarea
                                value={payload.notes ?? ''}
                                onChange={(event) =>
                                    setPayload((current) => ({
                                        ...current,
                                        notes: event.target.value,
                                    }))
                                }
                                placeholder="Préférence, remarque, acompte..."
                                className={cn(selectClass, 'min-h-24 resize-y py-3')}
                            />
                        </Field>

                        {createMutation.isError && (
                            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                {getErrorMessage(createMutation.error)}
                            </div>
                        )}

                        <Button
                            type="button"
                            variant="accent"
                            className="w-full"
                            disabled={!canSubmit || createMutation.isPending}
                            onClick={submit}
                        >
                            <Plus />
                            Enregistrer la réservation
                        </Button>

                        {selectedService && (
                            <p className="text-xs text-muted-foreground">
                                Fin estimée à partir de la durée du service: {selectedService.duration_minutes}{' '}
                                min.
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                        <div>
                            <CardTitle>Réservations du jour</CardTitle>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                {(appointments ?? []).length} rendez-vous planifié
                                {(appointments ?? []).length > 1 ? 's' : ''}
                            </p>
                        </div>
                        <Badge variant="accent">{date}</Badge>
                    </CardHeader>
                    <CardContent>
                        {appointmentsPending ? (
                            <div className="space-y-3">
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <Skeleton key={index} className="h-20 rounded-md" />
                                ))}
                            </div>
                        ) : (appointments ?? []).length === 0 ? (
                            <EmptyState
                                icon={CalendarDays}
                                title="Aucune réservation"
                                description="Les rendez-vous créés pour cette journée s’afficheront ici."
                            />
                        ) : (
                            <div className="space-y-2">
                                {(appointments ?? []).map((appointment) => (
                                    <AppointmentRow
                                        key={appointment.id}
                                        appointment={appointment}
                                        onStatus={(status) =>
                                            updateMutation.mutate({
                                                id: appointment.id,
                                                next: { status },
                                            })
                                        }
                                        onDelete={() => {
                                            const confirmed = window.confirm(
                                                `Supprimer la réservation de ${appointment.client?.name ?? 'ce client'} ?`,
                                            );
                                            if (confirmed) deleteMutation.mutate(appointment.id);
                                        }}
                                        disabled={updateMutation.isPending || deleteMutation.isPending}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function sortAppointments(left: Appointment, right: Appointment) {
    return new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime();
}

const selectClass = cn(
    'flex h-11 w-full rounded-md border border-input bg-white/[0.03] px-3.5 py-2 text-sm text-foreground shadow-sm transition-all duration-200',
    'focus-visible:border-accent/60 focus-visible:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10',
    'disabled:cursor-not-allowed disabled:opacity-50',
);

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </span>
            <div className="mt-2">{children}</div>
        </label>
    );
}

function PickerButton({
    selected,
    onClick,
    children,
}: {
    selected: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                selected
                    ? 'border-accent/60 bg-accent/[0.12] text-foreground'
                    : 'border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:border-accent/30 hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}

function AppointmentRow({
    appointment,
    onStatus,
    onDelete,
    disabled,
}: {
    appointment: Appointment;
    onStatus: (status: AppointmentStatus) => void;
    onDelete: () => void;
    disabled: boolean;
}) {
    const meta = statusMeta(appointment.status);

    return (
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-md bg-white/[0.04]">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                            {formatTime(appointment.starts_at)}
                        </span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                            {formatTime(appointment.ends_at)}
                        </span>
                    </div>
                    <span
                        className="h-11 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: appointment.service?.color ?? '#C8A24C' }}
                    />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                            {appointment.client?.name ?? 'Client'}
                        </p>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {appointment.service?.name ?? 'Service'} ·{' '}
                        {appointment.employee?.name ?? 'Employé'}
                    </p>
                    {appointment.notes && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                            {appointment.notes}
                        </p>
                    )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onStatus('confirmed')}
                    >
                        <Clock />
                        Confirmé
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onStatus('completed')}
                    >
                        <CheckCircle2 />
                        Terminé
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onStatus('cancelled')}
                    >
                        <XCircle />
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={disabled}
                        aria-label="Supprimer la réservation"
                        onClick={onDelete}
                        className="h-9 w-9"
                    >
                        <Trash2 className="text-destructive" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
