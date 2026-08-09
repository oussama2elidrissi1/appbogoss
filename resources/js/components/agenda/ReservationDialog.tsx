import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertCircle,
    Check,
    Info,
    Loader2,
    Plus,
    Search,
    Trash2,
    UserPlus,
    XCircle,
} from 'lucide-react';
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
    Client,
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
    /** Partner accounts: no employee assignment, no status control (forced "pending" server-side). */
    partnerMode?: boolean;
}

type PersonDraft = { name: string | null };
type ItemDraft = { service_id: number; employee_id: number | null; person_index: number };

/**
 * Professional reservation flow:
 * 1. one booking contact (the only person whose coordinates are captured),
 * 2. any number of participants,
 * 3. each participant gets their own services (employee optional per line).
 */
export function ReservationDialog({
    open,
    onOpenChange,
    mode,
    appointment,
    initialStart,
    initialResourceId,
    employees,
    services,
    partnerMode = false,
}: ReservationDialogProps) {
    const queryClient = useQueryClient();
    const [clientSearch, setClientSearch] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [serviceCategory, setServiceCategory] = useState<CategoryConfig>(CATEGORIES[0]);
    const [serviceSearch, setServiceSearch] = useState('');
    const [payload, setPayload] = useState<AppointmentPayload>({});
    const [people, setPeople] = useState<PersonDraft[]>([{ name: null }]);
    const [items, setItems] = useState<ItemDraft[]>([]);
    const [activePerson, setActivePerson] = useState(0);
    const [selectedClient, setSelectedClient] = useState<{ id: number; name: string; phone: string | null } | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    useEffect(() => {
        if (!open) return;

        if (mode === 'edit' && appointment) {
            setItems(
                itemsOf(appointment).map((item) => ({
                    service_id: item.service_id,
                    employee_id: item.employee_id,
                    person_index: item.person_index ?? 0,
                })),
            );
            const hydratedPeople: PersonDraft[] = appointment.people?.length
                ? appointment.people.map((person) => ({ name: person.name ?? null }))
                : appointment.clients?.length
                  ? appointment.clients.map((client) => ({ name: client.name }))
                  : [{ name: appointment.client?.name ?? null }];
            setPeople(hydratedPeople);
            setSelectedClient(
                appointment.client ??
                    appointment.clients?.find((client) => client.id === appointment.client_id) ??
                    null,
            );
            setPayload({
                starts_at: toDateTimeLocal(new Date(appointment.starts_at)),
                status: appointment.status,
                notes: appointment.notes ?? '',
                client_id: appointment.client_id,
            });
        } else {
            setItems([]);
            setPeople([{ name: null }]);
            setSelectedClient(null);
            setPayload({
                starts_at: toDateTimeLocal(initialStart ?? roundedNow()),
                status: partnerMode ? 'pending' : 'confirmed',
                notes: '',
            });
            setServiceCategory(CATEGORIES[0]);
            setServiceSearch('');
        }
        setActivePerson(0);
        setClientSearch('');
        setClientPhone('');
    }, [open, mode, appointment, initialStart, initialResourceId, partnerMode]);

    const { data: clients, isPending: clientsPending } = useQuery({
        queryKey: ['clients', clientSearch],
        queryFn: () => getClients(clientSearch),
        staleTime: 30_000,
        enabled: open,
    });

    const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);

    const totalPrice = items.reduce((total, item) => total + (serviceById.get(item.service_id)?.price ?? 0), 0);

    /** Mirrors the server rule: parallel chains per employee, per person for unassigned lines. */
    const totalDuration = useMemo(() => {
        const chains = new Map<string, number>();
        items.forEach((item) => {
            const service = serviceById.get(item.service_id);
            if (!service) return;
            const key = item.employee_id ? `e${item.employee_id}` : `p${item.person_index}`;
            chains.set(key, (chains.get(key) ?? 0) + service.duration_minutes);
        });
        return Math.max(0, ...chains.values());
    }, [items, serviceById]);

    const filteredServices = useMemo(() => {
        const term = serviceSearch.trim().toLowerCase();
        const categoryServices = services.filter((service) => service.category === serviceCategory.value);
        if (!term) return categoryServices;
        return categoryServices.filter((service) => service.name.toLowerCase().includes(term));
    }, [services, serviceCategory.value, serviceSearch]);

    function personLabel(index: number): string {
        const name = people[index]?.name?.trim();
        return name || `Personne ${index + 1}`;
    }

    function itemsOfPerson(index: number): Array<{ item: ItemDraft; itemIndex: number }> {
        return items
            .map((item, itemIndex) => ({ item, itemIndex }))
            .filter(({ item }) => item.person_index === index);
    }

    function selectClient(client: { id: number; name: string; phone: string | null }) {
        if (selectedClient?.id === client.id) {
            setSelectedClient(null);
            setPayload((current) => ({ ...current, client_id: undefined }));
            return;
        }
        setSelectedClient(client);
        setPayload((current) => ({ ...current, client_id: client.id }));
        setPeople((current) => current.map((person, index) => (index === 0 ? { name: client.name } : person)));
    }

    function addPerson() {
        setPeople((current) => {
            setActivePerson(current.length);
            return [...current, { name: null }];
        });
    }

    function removePerson(index: number) {
        if (index === 0) return;
        setPeople((current) => current.filter((_, personIndex) => personIndex !== index));
        setItems((current) =>
            current
                .filter((item) => item.person_index !== index)
                .map((item) => ({
                    ...item,
                    person_index: item.person_index > index ? item.person_index - 1 : item.person_index,
                })),
        );
        setActivePerson((current) => (current >= index ? Math.max(0, current - 1) : current));
    }

    function renamePerson(index: number, name: string) {
        setPeople((current) =>
            current.map((person, personIndex) => (personIndex === index ? { name: name || null } : person)),
        );
    }

    /** Cart-style: every click adds a new line for the active person. */
    function addService(service: Service) {
        const preferredEmployee =
            !partnerMode && initialResourceId && initialResourceId !== UNASSIGNED_RESOURCE_ID
                ? initialResourceId
                : null;
        setItems((current) => [
            ...current,
            { service_id: service.id, employee_id: preferredEmployee, person_index: activePerson },
        ]);
    }

    function removeItemAt(itemIndex: number) {
        setItems((current) => current.filter((_, index) => index !== itemIndex));
    }

    function assignEmployeeAt(itemIndex: number, employeeId: number | null) {
        setItems((current) =>
            current.map((item, index) => (index === itemIndex ? { ...item, employee_id: employeeId } : item)),
        );
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
        onSuccess: (client: Client) => {
            queryClient.setQueryData(['clients', clientSearch], (current: unknown) => {
                if (!Array.isArray(current)) return [client];
                return [client, ...current.filter((item) => item.id !== client.id)];
            });
            selectClient({ id: client.id, name: client.name, phone: client.phone });
        },
    });

    const saving = createMutation.isPending || updateMutation.isPending;
    const mutationError = createMutation.error ?? updateMutation.error;

    const personsWithoutService = people
        .map((_, index) => index)
        .filter((index) => itemsOfPerson(index).length === 0);
    const canSubmit =
        Boolean(payload.client_id) &&
        Boolean(payload.starts_at) &&
        items.length > 0 &&
        personsWithoutService.length === 0;

    function submit() {
        if (!canSubmit || saving) return;
        // Duration is re-derived from the selected services; only an explicit calendar
        // resize persists a manual override, so a normal form save intentionally drops it.
        const next: AppointmentPayload = {
            ...payload,
            client_ids: payload.client_id ? [payload.client_id] : [],
            people: people.map((person) => ({ name: person.name?.trim() || null })),
            items,
            duration_override_minutes: null,
        };
        if (partnerMode) {
            // The server forces "pending" for partner creations and ignores
            // non-cancellation status changes anyway.
            delete next.status;
        }
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
                        Renseignez le client titulaire (ses coordonnées suffisent pour tout le groupe), ajoutez
                        les personnes, puis les prestations de chacune.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* ------------------------------------------------ contact */}
                    <Field label="Client titulaire (coordonnées)">
                        {selectedClient ? (
                            <div className="flex items-center justify-between gap-3 rounded-md border border-accent/50 bg-accent/[0.1] px-3.5 py-2.5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{selectedClient.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {selectedClient.phone ?? 'Sans téléphone'}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => selectClient(selectedClient)}
                                >
                                    Changer
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                    <Input
                                        value={clientSearch}
                                        onChange={(event) => setClientSearch(event.target.value)}
                                        placeholder="Rechercher ou saisir un nom..."
                                        className="pl-10"
                                    />
                                </div>
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
                                <div className="mt-2 grid max-h-36 gap-2 overflow-y-auto">
                                    {clientsPending ? (
                                        <Skeleton className="h-10 rounded-md" />
                                    ) : (
                                        (clients ?? []).map((client) => (
                                            <PickerButton
                                                key={client.id}
                                                selected={false}
                                                onClick={() =>
                                                    selectClient({
                                                        id: client.id,
                                                        name: client.name,
                                                        phone: client.phone,
                                                    })
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
                            </>
                        )}
                    </Field>

                    {createClientMutation.isError && (
                        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {getErrorMessage(createClientMutation.error)}
                        </div>
                    )}

                    {/* ------------------------------------------------ participants */}
                    <Field label={`Personnes (${people.length})`}>
                        <div className="space-y-2">
                            {people.map((person, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-tint/[0.1] bg-tint/[0.04] text-xs font-semibold text-muted-foreground">
                                        {index + 1}
                                    </span>
                                    {index === 0 ? (
                                        <div className="flex h-11 flex-1 items-center rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3.5 text-sm">
                                            <span className="truncate font-medium">
                                                {selectedClient?.name ?? 'Client titulaire'}
                                            </span>
                                            <span className="ml-2 shrink-0 rounded-full bg-accent/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                                Contact
                                            </span>
                                        </div>
                                    ) : (
                                        <>
                                            <Input
                                                value={person.name ?? ''}
                                                onChange={(event) => renamePerson(index, event.target.value)}
                                                placeholder={`Nom de la personne ${index + 1} (facultatif)`}
                                            />
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                aria-label="Retirer cette personne"
                                                onClick={() => removePerson(index)}
                                            >
                                                <XCircle className="text-destructive" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                disabled={people.length >= 20}
                                onClick={addPerson}
                            >
                                <UserPlus />
                                Ajouter une personne
                            </Button>
                        </div>
                    </Field>

                    {/* ------------------------------------------------ services per person */}
                    <Field label="Prestations — pour qui ?">
                        <div className="flex flex-wrap gap-2">
                            {people.map((_, index) => {
                                const count = itemsOfPerson(index).length;
                                const selected = activePerson === index;
                                return (
                                    <button
                                        key={index}
                                        type="button"
                                        onClick={() => setActivePerson(index)}
                                        className={cn(
                                            'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                                            selected
                                                ? 'border-accent/60 bg-accent/[0.14] text-foreground'
                                                : 'border-tint/[0.08] bg-tint/[0.02] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                                        )}
                                    >
                                        {personLabel(index)}
                                        <span
                                            className={cn(
                                                'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold',
                                                count > 0
                                                    ? 'bg-accent text-accent-foreground'
                                                    : 'bg-tint/[0.08] text-muted-foreground',
                                            )}
                                        >
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            Les prestations ajoutées ci-dessous seront affectées à{' '}
                            <span className="font-semibold text-foreground">{personLabel(activePerson)}</span>.
                        </p>
                    </Field>

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
                                <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-2">
                                    {filteredServices.map((service) => (
                                        <ServiceCard
                                            key={service.id}
                                            service={service}
                                            count={
                                                items.filter(
                                                    (item) =>
                                                        item.service_id === service.id &&
                                                        item.person_index === activePerson,
                                                ).length
                                            }
                                            onClick={() => addService(service)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </Field>

                    {/* ------------------------------------------------ cart grouped by person */}
                    <Field label={partnerMode ? 'Récapitulatif par personne' : 'Récapitulatif & employé (facultatif)'}>
                        {items.length === 0 ? (
                            <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                                Sélectionnez une ou plusieurs prestations ci-dessus.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {people.map((_, personIndex) => {
                                    const personItems = itemsOfPerson(personIndex);
                                    if (personItems.length === 0) return null;
                                    return (
                                        <div key={personIndex}>
                                            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                                <Check className="h-3.5 w-3.5 text-accent" />
                                                {personLabel(personIndex)}
                                                {personIndex === 0 && (
                                                    <span className="font-normal text-muted-foreground">(contact)</span>
                                                )}
                                            </p>
                                            <div className="space-y-2">
                                                {personItems.map(({ item, itemIndex }) => {
                                                    const service = serviceById.get(item.service_id);
                                                    return (
                                                        <div
                                                            key={`${item.service_id}-${itemIndex}`}
                                                            className="flex items-center gap-3 rounded-md border border-tint/[0.08] bg-tint/[0.025] px-3 py-2.5"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-sm font-medium">
                                                                    {service?.name ?? 'Prestation'}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {service?.duration_minutes ?? 0} min ·{' '}
                                                                    {formatCurrency(service?.price ?? 0)}
                                                                </p>
                                                            </div>
                                                            {!partnerMode && (
                                                                <select
                                                                    value={item.employee_id ?? ''}
                                                                    onChange={(event) =>
                                                                        assignEmployeeAt(
                                                                            itemIndex,
                                                                            event.target.value
                                                                                ? Number(event.target.value)
                                                                                : null,
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
                                                            )}
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="ghost"
                                                                aria-label="Retirer cette prestation"
                                                                onClick={() => removeItemAt(itemIndex)}
                                                            >
                                                                <XCircle className="text-destructive" />
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {items.length > 0 && personsWithoutService.length > 0 && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                                <AlertCircle className="h-3.5 w-3.5" />
                                {personsWithoutService.map((index) => personLabel(index)).join(', ')}{' '}
                                n'a pas encore de prestation.
                            </p>
                        )}
                    </Field>

                    {/* ------------------------------------------------ schedule */}
                    <div className={cn('grid grid-cols-1 gap-3', !partnerMode && 'sm:grid-cols-2')}>
                        <Field label="Date et heure">
                            <Input
                                type="datetime-local"
                                value={payload.starts_at ?? ''}
                                onChange={(event) => setPayload((current) => ({ ...current, starts_at: event.target.value }))}
                            />
                        </Field>
                        {!partnerMode && (
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
                        )}
                    </div>

                    {partnerMode && mode === 'create' && (
                        <div className="flex items-center gap-2 rounded-md border border-accent/25 bg-accent/[0.06] px-3 py-2 text-xs text-muted-foreground">
                            <Info className="h-4 w-4 shrink-0 text-accent" />
                            Votre réservation sera envoyée « En attente » — le salon la confirmera.
                        </div>
                    )}

                    <Field label="Notes">
                        <textarea
                            value={payload.notes ?? ''}
                            onChange={(event) => setPayload((current) => ({ ...current, notes: event.target.value }))}
                            placeholder="Préférence, remarque, acompte..."
                            className={cn(selectClass, 'min-h-24 resize-y py-3')}
                        />
                    </Field>

                    {items.length > 0 && (
                        <div className="flex items-center justify-between rounded-md border border-accent/20 bg-accent/[0.06] px-3 py-2 text-xs text-muted-foreground">
                            <span>
                                {people.length} personne{people.length > 1 ? 's' : ''} · {items.length} prestation
                                {items.length > 1 ? 's' : ''} · durée estimée {totalDuration} min
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
                        ? `La réservation de ${appointment.client?.name || appointment.clients?.map((c) => c.name).join(', ') || 'ce client'} sera définitivement supprimée.`
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

function ServiceCard({ service, count, onClick }: { service: Service; count: number; onClick: () => void }) {
    const selected = count > 0;

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'relative flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left transition-all duration-200 active:scale-[0.98]',
                selected
                    ? 'border-accent/60 bg-accent/[0.12] shadow-glow'
                    : 'border-tint/[0.08] bg-tint/[0.03] hover:border-accent/30 hover:bg-tint/[0.06]',
            )}
        >
            {selected && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground shadow-soft">
                    {count}
                </span>
            )}
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
