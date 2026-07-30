import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    Clock,
    Plus,
    Search,
    Trash2,
    XCircle,
} from 'lucide-react';
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
    Service,
} from '@/types/workday';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { CATEGORIES, type CategoryConfig } from '@/components/workday/categories';

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
    const [serviceCategory, setServiceCategory] = useState<CategoryConfig>(CATEGORIES[0]);
    const [serviceSearch, setServiceSearch] = useState('');
    const [payload, setPayload] = useState<AppointmentPayload>({
        starts_at: defaultStart(),
        status: 'confirmed',
        notes: '',
    });

    const appointmentKey = ['appointments', date] as const;
    const participantIds = payload.client_ids ?? (payload.client_id ? [payload.client_id] : []);

    const { data: appointments, isPending: appointmentsPending } = useQuery({
        queryKey: appointmentKey,
        queryFn: () => getAppointments({ date }),
        refetchInterval: 10_000,
    });

    const { data: employees } = useQuery({
        queryKey: ['employees', 'agenda'],
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
    });

    const { data: services, isPending: servicesPending } = useQuery({
        queryKey: ['services', 'agenda', 'all'],
        queryFn: () => getServices(),
        staleTime: 5 * 60_000,
    });

    const { data: clients, isPending: clientsPending } = useQuery({
        queryKey: ['clients', clientSearch],
        queryFn: () => getClients(clientSearch),
        staleTime: 30_000,
    });

    const reservationItems = payload.items ?? [];
    const selectedServices = useMemo(
        () => reservationItems
            .map((item) => services?.find((service) => service.id === item.service_id) ?? null)
            .filter((service): service is Service => service !== null),
        [reservationItems, services],
    );
    const selectedService = selectedServices[0] ?? null;
    const totalDuration = useMemo(() => {
        const byEmployee = new Map<number, number>();
        reservationItems.forEach((item) => {
            const service = services?.find((entry) => entry.id === item.service_id);
            if (service) byEmployee.set(item.employee_id, (byEmployee.get(item.employee_id) ?? 0) + service.duration_minutes);
        });
        return Math.max(0, ...byEmployee.values());
    }, [reservationItems, services]);
    const totalPrice = selectedServices.reduce((total, service) => total + service.price, 0);

    const filteredServices = useMemo(() => {
        const term = serviceSearch.trim().toLowerCase();
        const categoryServices = (services ?? []).filter((service) => service.category === serviceCategory.value);
        if (!term) return categoryServices;

        return categoryServices.filter((service) => service.name.toLowerCase().includes(term));
    }, [services, serviceCategory.value, serviceSearch]);

    function toggleService(service: Service) {
        setPayload((current) => {
            const currentItems = current.items ?? [];
            const exists = currentItems.some((item) => item.service_id === service.id);
            const items = exists
                ? currentItems.filter((item) => item.service_id !== service.id)
                : [...currentItems, { service_id: service.id, employee_id: employees?.[0]?.id ?? 0 }];
            return {
                ...current,
                items,
                service_id: items[0]?.service_id,
                employee_id: items[0]?.employee_id || undefined,
            };
        });
    }

    function assignEmployee(serviceId: number, employeeId: number) {
        setPayload((current) => {
            const items = (current.items ?? []).map((item) =>
                item.service_id === serviceId ? { ...item, employee_id: employeeId } : item,
            );
            return {
                ...current,
                items,
                employee_id: items[0]?.employee_id || undefined,
            };
        });
    }

    function toggleClient(clientId: number) {
        setPayload((current) => {
            const currentIds = current.client_ids ?? (current.client_id ? [current.client_id] : []);
            const client_ids = currentIds.includes(clientId)
                ? currentIds.filter((id) => id !== clientId)
                : [...currentIds, clientId];
            return { ...current, client_ids, client_id: client_ids[0] };
        });
    }

    const canSubmit =
        participantIds.length > 0 &&
        reservationItems.length > 0 &&
        reservationItems.every((item) => item.employee_id > 0) &&
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
                items: [],
                client_ids: [],
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
            setPayload((current) => ({
                ...current,
                client_id: client.id,
                client_ids: [...(current.client_ids ?? []), client.id],
            }));
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

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[560px_minmax(0,1fr)]">
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
                                            selected={participantIds.includes(client.id)}
                                            onClick={() => toggleClient(client.id)}
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

                        {participantIds.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {participantIds.length} participant{participantIds.length > 1 ? 's' : ''} sélectionné{participantIds.length > 1 ? 's' : ''}.
                            </p>
                        )}

                        {createClientMutation.isError && (
                            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                {getErrorMessage(createClientMutation.error)}
                            </div>
                        )}

                        <Field label="Catégorie">
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                                {CATEGORIES.map((category, index) => {
                                    const Icon = category.icon;
                                    const selected = serviceCategory.value === category.value;

                                    return (
                                        <button
                                            key={category.value}
                                            type="button"
                                            onClick={() => {
                                                setServiceCategory(category);
                                                setServiceSearch('');
                                            }}
                                            className={cn(
                                                'relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-2 text-center transition-all duration-200 active:scale-[0.98]',
                                                selected
                                                    ? 'border-accent/60 bg-accent/[0.12] text-foreground shadow-glow'
                                                    : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-accent/30 hover:bg-white/[0.06] hover:text-foreground',
                                            )}
                                        >
                                            <Icon
                                                className={cn(
                                                    'h-4 w-4',
                                                    selected ? category.chip : 'text-muted-foreground',
                                                )}
                                            />
                                            <span className="truncate text-xs font-medium">
                                                {category.label}
                                            </span>
                                            <span className="absolute right-1.5 top-1.5 text-[10px] font-semibold text-muted-foreground/50">
                                                {index + 1}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>

                        <Field label="Service">
                            <div className="space-y-2.5">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                    <Input
                                        value={serviceSearch}
                                        onChange={(event) => setServiceSearch(event.target.value)}
                                        placeholder={`Rechercher une prestation ${serviceCategory.label.toLowerCase()}...`}
                                        className="pl-10"
                                    />
                                </div>

                                {servicesPending ? (
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {Array.from({ length: 4 }).map((_, index) => (
                                            <Skeleton key={index} className="h-16 rounded-md" />
                                        ))}
                                    </div>
                                ) : filteredServices.length === 0 ? (
                                    <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                                        Aucun service dans cette catégorie.
                                    </div>
                                ) : (
                                    <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-2">
                                        {filteredServices.map((service) => (
                                            <ServiceCard
                                                key={service.id}
                                                service={service}
                                                selected={reservationItems.some((item) => item.service_id === service.id)}
                                                onClick={() => toggleService(service)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Field>

                        <div className="hidden" aria-hidden="true">
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

                        </div>

                        <Field label="Employé">
                            {reservationItems.length === 0 ? (
                                <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                                    Sélectionnez une ou plusieurs prestations ci-dessus.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {reservationItems.map((item) => {
                                        const service = services?.find((entry) => entry.id === item.service_id);
                                        return (
                                            <div key={item.service_id} className="flex items-center gap-3 rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2.5">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">{service?.name ?? 'Prestation'}</p>
                                                    <p className="text-xs text-muted-foreground">{service?.duration_minutes ?? 0} min · {formatCurrency(service?.price ?? 0)}</p>
                                                </div>
                                                <select value={item.employee_id || ''} onChange={(event) => assignEmployee(item.service_id, Number(event.target.value))} className={cn(selectClass, 'h-9 max-w-[170px]')}>
                                                    <option value="">Choisir un employé</option>
                                                    {(employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                                                </select>
                                                <Button type="button" size="icon" variant="ghost" aria-label="Retirer la prestation" onClick={() => service && toggleService(service)}><XCircle className="text-destructive" /></Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
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

                        {reservationItems.length > 0 && (
                            <div className="flex items-center justify-between rounded-md border border-accent/20 bg-accent/[0.06] px-3 py-2 text-xs text-muted-foreground">
                                <span>{reservationItems.length} prestation{reservationItems.length > 1 ? 's' : ''} · durée estimée {totalDuration} min</span>
                                <span className="font-semibold text-accent">{formatCurrency(totalPrice)}</span>
                            </div>
                        )}

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

function ServiceCard({
    service,
    selected,
    onClick,
}: {
    service: Service;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left transition-all duration-200 active:scale-[0.98]',
                selected
                    ? 'border-accent/60 bg-accent/[0.12] shadow-glow'
                    : 'border-white/[0.08] bg-white/[0.03] hover:border-accent/30 hover:bg-white/[0.06]',
            )}
        >
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                    {service.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                    {service.duration_minutes} min
                </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                {formatCurrency(service.price, { maximumFractionDigits: 2 })}
            </span>
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
                    {(appointment.clients?.length ?? 0) > 1 && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                            Participants : {appointment.clients?.map((client) => client.name).join(', ')}
                        </p>
                    )}
                    {((appointment.services?.length ?? 0) > 1 || (appointment.employees?.length ?? 0) > 1) && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                            {(appointment.services ?? []).map((service) => service.name).join(' · ')} · {(appointment.employees ?? []).map((employee) => employee.name).join(', ')}
                        </p>
                    )}
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
