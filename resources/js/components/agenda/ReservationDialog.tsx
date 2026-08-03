import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, Search, Trash2, XCircle } from 'lucide-react';
import {
    createAppointment,
    createClient,
    deleteAppointment,
    getClients,
    getErrorMessage,
    updateAppointment,
} from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import type {
    Appointment,
    AppointmentPayload,
    AppointmentStatus,
    Employee,
    Service,
} from '@/types/workday';
import { itemsOf, UNASSIGNED_RESOURCE_ID } from './agendaEvents';
import { type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CATEGORIES, type CategoryConfig } from '@/components/workday/categories';

const statuses: Array<{ value: AppointmentStatus; label: string; variant: BadgeProps['variant'] }> = [
    { value: 'pending', label: 'En attente', variant: 'default' },
    { value: 'confirmed', label: 'Confirmé', variant: 'accent' },
    { value: 'completed', label: 'Terminé', variant: 'success' },
    { value: 'cancelled', label: 'Annulé', variant: 'destructive' },
    { value: 'no_show', label: 'Absent', variant: 'destructive' },
];

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

/** `datetime-local` wants a naive `YYYY-MM-DDTHH:mm` in the user's wall-clock time. */
function toDateTimeLocal(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface ReservationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    appointment: Appointment | null;
    initialStart: Date | null;
    initialResourceId: number | typeof UNASSIGNED_RESOURCE_ID | null;
    employees: Employee[];
    services: Service[];
}

export function ReservationDialog({
    open,
    onOpenChange,
    mode,
    appointment,
    initialStart,
    initialResourceId,
    employees,
    services,
}: ReservationDialogProps) {
    const queryClient = useQueryClient();
    const [clientSearch, setClientSearch] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [serviceCategory, setServiceCategory] = useState<CategoryConfig>(CATEGORIES[0]);
    const [serviceSearch, setServiceSearch] = useState('');
    const [payload, setPayload] = useState<AppointmentPayload>({});
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    useEffect(() => {
        if (!open) return;

        if (mode === 'edit' && appointment) {
            const items = itemsOf(appointment).map((item) => ({
                service_id: item.service_id,
                employee_id: item.employee_id,
            }));
            setPayload({
                starts_at: toDateTimeLocal(new Date(appointment.starts_at)),
                status: appointment.status,
                notes: appointment.notes ?? '',
                items,
                client_ids: appointment.client_ids?.length
                    ? appointment.client_ids
                    : appointment.client_id
                      ? [appointment.client_id]
                      : [],
            });
        } else {
            setPayload({
                starts_at: toDateTimeLocal(initialStart ?? roundedNow()),
                status: 'confirmed',
                notes: '',
                items: [],
                client_ids: [],
            });
            setServiceCategory(CATEGORIES[0]);
            setServiceSearch('');
        }
        setClientSearch('');
        setClientPhone('');
    }, [open, mode, appointment, initialStart, initialResourceId]);

    const participantIds = payload.client_ids ?? [];

    const { data: clients, isPending: clientsPending } = useQuery({
        queryKey: ['clients', clientSearch],
        queryFn: () => getClients(clientSearch),
        staleTime: 30_000,
        enabled: open,
    });

    const reservationItems = payload.items ?? [];
    const selectedServices = useMemo(
        () =>
            reservationItems
                .map((item) => services.find((service) => service.id === item.service_id) ?? null)
                .filter((service): service is Service => service !== null),
        [reservationItems, services],
    );
    const totalDuration = useMemo(() => {
        const byEmployee = new Map<string, number>();
        reservationItems.forEach((item) => {
            const service = services.find((entry) => entry.id === item.service_id);
            if (!service) return;
            const key = item.employee_id ? String(item.employee_id) : UNASSIGNED_RESOURCE_ID;
            byEmployee.set(key, (byEmployee.get(key) ?? 0) + service.duration_minutes);
        });
        return Math.max(0, ...byEmployee.values());
    }, [reservationItems, services]);
    const totalPrice = selectedServices.reduce((total, service) => total + service.price, 0);

    const filteredServices = useMemo(() => {
        const term = serviceSearch.trim().toLowerCase();
        const categoryServices = services.filter((service) => service.category === serviceCategory.value);
        if (!term) return categoryServices;
        return categoryServices.filter((service) => service.name.toLowerCase().includes(term));
    }, [services, serviceCategory.value, serviceSearch]);

    function toggleService(service: Service) {
        setPayload((current) => {
            const currentItems = current.items ?? [];
            const exists = currentItems.some((item) => item.service_id === service.id);
            const preferredEmployee =
                initialResourceId && initialResourceId !== UNASSIGNED_RESOURCE_ID ? initialResourceId : null;
            const items = exists
                ? currentItems.filter((item) => item.service_id !== service.id)
                : [...currentItems, { service_id: service.id, employee_id: preferredEmployee }];
            return { ...current, items };
        });
    }

    function assignEmployee(serviceId: number, employeeId: number | null) {
        setPayload((current) => ({
            ...current,
            items: (current.items ?? []).map((item) =>
                item.service_id === serviceId ? { ...item, employee_id: employeeId } : item,
            ),
        }));
    }

    function toggleClient(clientId: number) {
        setPayload((current) => {
            const currentIds = current.client_ids ?? [];
            const client_ids = currentIds.includes(clientId)
                ? currentIds.filter((id) => id !== clientId)
                : [...currentIds, clientId];
            return { ...current, client_ids };
        });
    }

    function invalidateAppointments() {
        void queryClient.invalidateQueries({ queryKey: ['appointments'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    const createMutation = useMutation({
        mutationFn: createAppointment,
        onSuccess: () => {
            invalidateAppointments();
            onOpenChange(false);
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, next }: { id: number; next: AppointmentPayload }) => updateAppointment(id, next),
        onSuccess: () => {
            invalidateAppointments();
            onOpenChange(false);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteAppointment,
        onSuccess: () => {
            invalidateAppointments();
            onOpenChange(false);
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
                client_ids: [...(current.client_ids ?? []), client.id],
            }));
        },
    });

    const saving = createMutation.isPending || updateMutation.isPending;
    const mutationError = createMutation.error ?? updateMutation.error;
    const canSubmit = participantIds.length > 0 && reservationItems.length > 0 && Boolean(payload.starts_at);

    function submit() {
        if (!canSubmit || saving) return;
        // Duration is re-derived from the selected services; only an explicit calendar
        // resize persists a manual override, so a normal form save intentionally drops it.
        const next: AppointmentPayload = { ...payload, duration_override_minutes: null };
        if (mode === 'edit' && appointment) {
            updateMutation.mutate({ id: appointment.id, next });
        } else {
            createMutation.mutate(next);
        }
    }

    function handleDelete() {
        if (!appointment) return;
        deleteMutation.mutate(appointment.id, { onSuccess: () => setConfirmingDelete(false) });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{mode === 'edit' ? 'Modifier la réservation' : 'Nouvelle réservation'}</DialogTitle>
                    <DialogDescription>
                        Sélectionnez un ou plusieurs clients, une ou plusieurs prestations, et assignez un
                        employé à chaque prestation si vous le connaissez déjà.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <Field label="Client(s)">
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
                                disabled={clientSearch.trim().length < 2 || createClientMutation.isPending}
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
                            {participantIds.length} participant{participantIds.length > 1 ? 's' : ''} sélectionné
                            {participantIds.length > 1 ? 's' : ''}.
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
                                                : 'border-tint/[0.08] bg-tint/[0.03] text-muted-foreground hover:border-accent/30 hover:bg-tint/[0.06] hover:text-foreground',
                                        )}
                                    >
                                        <Icon className={cn('h-4 w-4', selected ? category.chip : 'text-muted-foreground')} />
                                        <span className="truncate text-xs font-medium">{category.label}</span>
                                        <span className="absolute right-1.5 top-1.5 text-[10px] font-semibold text-muted-foreground/50">
                                            {index + 1}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </Field>

                    <Field label="Prestations">
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

                            {filteredServices.length === 0 ? (
                                <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
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

                    <Field label="Employé (facultatif)">
                        {reservationItems.length === 0 ? (
                            <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                                Sélectionnez une ou plusieurs prestations ci-dessus.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {reservationItems.map((item) => {
                                    const service = services.find((entry) => entry.id === item.service_id);
                                    return (
                                        <div
                                            key={item.service_id}
                                            className="flex items-center gap-3 rounded-md border border-tint/[0.08] bg-tint/[0.025] px-3 py-2.5"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">{service?.name ?? 'Prestation'}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {service?.duration_minutes ?? 0} min · {formatCurrency(service?.price ?? 0)}
                                                </p>
                                            </div>
                                            <select
                                                value={item.employee_id ?? ''}
                                                onChange={(event) =>
                                                    assignEmployee(
                                                        item.service_id,
                                                        event.target.value ? Number(event.target.value) : null,
                                                    )
                                                }
                                                className={cn(selectClass, 'h-9 max-w-[180px]')}
                                            >
                                                <option value="">Non assigné</option>
                                                {employees.map((employee) => (
                                                    <option key={employee.id} value={employee.id}>
                                                        {employee.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                aria-label="Retirer la prestation"
                                                onClick={() => service && toggleService(service)}
                                            >
                                                <XCircle className="text-destructive" />
                                            </Button>
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
                                onChange={(event) => setPayload((current) => ({ ...current, starts_at: event.target.value }))}
                            />
                        </Field>
                        <Field label="Statut">
                            <select
                                value={payload.status ?? 'confirmed'}
                                onChange={(event) =>
                                    setPayload((current) => ({ ...current, status: event.target.value as AppointmentStatus }))
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
                            onChange={(event) => setPayload((current) => ({ ...current, notes: event.target.value }))}
                            placeholder="Préférence, remarque, acompte..."
                            className={cn(selectClass, 'min-h-24 resize-y py-3')}
                        />
                    </Field>

                    {reservationItems.length > 0 && (
                        <div className="flex items-center justify-between rounded-md border border-accent/20 bg-accent/[0.06] px-3 py-2 text-xs text-muted-foreground">
                            <span>
                                {reservationItems.length} prestation{reservationItems.length > 1 ? 's' : ''} · durée estimée{' '}
                                {totalDuration} min
                            </span>
                            <span className="font-semibold text-accent">{formatCurrency(totalPrice)}</span>
                        </div>
                    )}

                    {mutationError && (
                        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {getErrorMessage(mutationError)}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
                    {mode === 'edit' ? (
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => setConfirmingDelete(true)}
                        >
                            {deleteMutation.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                            Supprimer
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Annuler
                        </Button>
                        <Button type="button" variant="accent" disabled={!canSubmit || saving} onClick={submit}>
                            {saving && <Loader2 className="animate-spin" />}
                            {mode === 'edit' ? 'Enregistrer' : 'Créer la réservation'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>

            <ConfirmDialog
                open={confirmingDelete}
                onOpenChange={setConfirmingDelete}
                title="Supprimer cette réservation ?"
                description={
                    appointment
                        ? `La réservation de ${appointment.clients?.map((c) => c.name).join(', ') || appointment.client?.name || 'ce client'} sera définitivement supprimée.`
                        : undefined
                }
                confirmLabel="Supprimer"
                loading={deleteMutation.isPending}
                onConfirm={handleDelete}
            />
        </Dialog>
    );
}

function roundedNow(): Date {
    const date = new Date();
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
    return date;
}

const selectClass = cn(
    'flex h-11 w-full rounded-md border border-input bg-tint/[0.03] px-3.5 py-2 text-sm text-foreground shadow-sm transition-all duration-200',
    'focus-visible:border-accent/60 focus-visible:bg-tint/[0.05] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10',
    'disabled:cursor-not-allowed disabled:opacity-50',
);

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
            <div className="mt-2">{children}</div>
        </label>
    );
}

function PickerButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                selected
                    ? 'border-accent/60 bg-accent/[0.12] text-foreground'
                    : 'border-tint/[0.08] bg-tint/[0.02] text-muted-foreground hover:border-accent/30 hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}

function ServiceCard({ service, selected, onClick }: { service: Service; selected: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left transition-all duration-200 active:scale-[0.98]',
                selected
                    ? 'border-accent/60 bg-accent/[0.12] shadow-glow'
                    : 'border-tint/[0.08] bg-tint/[0.03] hover:border-accent/30 hover:bg-tint/[0.06]',
            )}
        >
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{service.name}</span>
                <span className="block text-xs text-muted-foreground">{service.duration_minutes} min</span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                {formatCurrency(service.price, { maximumFractionDigits: 2 })}
            </span>
        </button>
    );
}
