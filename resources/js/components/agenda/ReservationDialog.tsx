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
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency } from '@/lib/utils';
import type {
    Appointment,
    AppointmentPayload,
    AppointmentStatus,
    Client,
    Employee,
    Service,
} from '@/types/workday';
import { UNASSIGNED_RESOURCE_ID } from './agendaEvents';
import { useReservationCart } from './useReservationCart';
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
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [clientSearch, setClientSearch] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [serviceCategory, setServiceCategory] = useState<CategoryConfig>(CATEGORIES[0]);
    const [serviceSearch, setServiceSearch] = useState('');
    const [payload, setPayload] = useState<AppointmentPayload>({});
    const [selectedClient, setSelectedClient] = useState<{ id: number; name: string; phone: string | null } | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const cart = useReservationCart(services);
    const {
        people,
        items,
        activePerson,
        setActivePerson,
        setPeople,
        serviceById,
        totalPrice,
        totalDuration,
        personLabel,
        itemsOfPerson,
        addPerson,
        removePerson,
        renamePerson,
        removeItemAt,
        assignEmployeeAt,
        personsWithoutService,
        hydrateFromAppointment,
        reset: resetCart,
    } = cart;

    useEffect(() => {
        if (!open) return;

        if (mode === 'edit' && appointment) {
            hydrateFromAppointment(appointment);
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
            resetCart();
            setSelectedClient(null);
            setPayload({
                starts_at: toDateTimeLocal(initialStart ?? roundedNow()),
                status: partnerMode ? 'pending' : 'confirmed',
                notes: '',
            });
            setServiceCategory(CATEGORIES[0]);
            setServiceSearch('');
        }
        setClientSearch('');
        setClientPhone('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, mode, appointment, initialStart, initialResourceId, partnerMode]);

    const { data: clients, isPending: clientsPending } = useQuery({
        queryKey: ['clients', clientSearch],
        queryFn: () => getClients(clientSearch),
        staleTime: 30_000,
        enabled: open,
    });

    const filteredServices = useMemo(() => {
        const term = serviceSearch.trim().toLowerCase();
        const categoryServices = services.filter((service) => service.category === serviceCategory.value);
        if (!term) return categoryServices;
        return categoryServices.filter((service) => service.name.toLowerCase().includes(term));
    }, [services, serviceCategory.value, serviceSearch]);

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

    /** Cart-style: every click adds a new line for the active person, preferring the dropped-on calendar column's employee. */
    function addService(service: Service) {
        const preferredEmployee =
            !partnerMode && initialResourceId && initialResourceId !== UNASSIGNED_RESOURCE_ID
                ? initialResourceId
                : null;
        cart.addService(service, activePerson, preferredEmployee);
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
                    <DialogTitle>{mode === 'edit' ? t('Modifier la réservation') : t('Nouvelle réservation')}</DialogTitle>
                    <DialogDescription>
                        {t('Renseignez le client titulaire (ses coordonnées suffisent pour tout le groupe), ajoutez les personnes, puis les prestations de chacune.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* ------------------------------------------------ contact */}
                    <Field label={t('Client titulaire (coordonnées)')}>
                        {selectedClient ? (
                            <div className="flex items-center justify-between gap-3 rounded-md border border-accent/50 bg-accent/[0.1] px-3.5 py-2.5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{selectedClient.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {selectedClient.phone ?? t('Sans téléphone')}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => selectClient(selectedClient)}
                                >
                                    {t('Changer')}
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                    <Input
                                        value={clientSearch}
                                        onChange={(event) => setClientSearch(event.target.value)}
                                        placeholder={t('Rechercher ou saisir un nom...')}
                                        className="pl-10"
                                    />
                                </div>
                                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                    <Input
                                        value={clientPhone}
                                        onChange={(event) => setClientPhone(event.target.value)}
                                        placeholder={t('Téléphone')}
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
                                        {t('Client')}
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
                                                    {client.phone ?? t('Sans téléphone')}
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
                    <Field label={t('Personnes ({n})', { n: people.length })}>
                        <div className="space-y-2">
                            {people.map((person, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-tint/[0.1] bg-tint/[0.04] text-xs font-semibold text-muted-foreground">
                                        {index + 1}
                                    </span>
                                    {index === 0 ? (
                                        <div className="flex h-11 flex-1 items-center rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3.5 text-sm">
                                            <span className="truncate font-medium">
                                                {selectedClient?.name ?? t('Client titulaire')}
                                            </span>
                                            <span className="ml-2 shrink-0 rounded-full bg-accent/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                                {t('Contact')}
                                            </span>
                                        </div>
                                    ) : (
                                        <>
                                            <Input
                                                value={person.name ?? ''}
                                                onChange={(event) => renamePerson(index, event.target.value)}
                                                placeholder={t('Nom de la personne {n} (facultatif)', { n: index + 1 })}
                                            />
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                aria-label={t('Retirer cette personne')}
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
                                {t('Ajouter une personne')}
                            </Button>
                        </div>
                    </Field>

                    {/* ------------------------------------------------ services per person */}
                    <Field label={t('Prestations — pour qui ?')}>
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
                            {t('Les prestations ajoutées ci-dessous seront affectées à')}{' '}
                            <span className="font-semibold text-foreground">{personLabel(activePerson)}</span>.
                        </p>
                    </Field>

                    <Field label={t('Catégorie')}>
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
                                        <span className="truncate text-xs font-medium">{t(category.label)}</span>
                                        <span className="absolute right-1.5 top-1.5 text-[10px] font-semibold text-muted-foreground/50">
                                            {index + 1}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </Field>

                    <Field label={t('Prestations')}>
                        <div className="space-y-2.5">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                <Input
                                    value={serviceSearch}
                                    onChange={(event) => setServiceSearch(event.target.value)}
                                    placeholder={t('Rechercher une prestation {category}...', {
                                        category: t(serviceCategory.label).toLowerCase(),
                                    })}
                                    className="pl-10"
                                />
                            </div>

                            {filteredServices.length === 0 ? (
                                <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                                    {t('Aucun service dans cette catégorie.')}
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
                    <Field label={partnerMode ? t('Récapitulatif par personne') : t('Récapitulatif & employé (facultatif)')}>
                        {items.length === 0 ? (
                            <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                                {t('Sélectionnez une ou plusieurs prestations ci-dessus.')}
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
                                                    <span className="font-normal text-muted-foreground">{t('(contact)')}</span>
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
                                                                    {service?.name ?? t('Prestation')}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {service?.duration_minutes ?? 0} {t('min')} ·{' '}
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
                                                                    <option value="">{t('Non assigné')}</option>
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
                                                                aria-label={t('Retirer cette prestation')}
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
                                {t("n'a pas encore de prestation.")}
                            </p>
                        )}
                    </Field>

                    {/* ------------------------------------------------ schedule */}
                    <div className={cn('grid grid-cols-1 gap-3', !partnerMode && 'sm:grid-cols-2')}>
                        <Field label={t('Date et heure')}>
                            <Input
                                type="datetime-local"
                                value={payload.starts_at ?? ''}
                                onChange={(event) => setPayload((current) => ({ ...current, starts_at: event.target.value }))}
                            />
                        </Field>
                        {!partnerMode && (
                            <Field label={t('Statut')}>
                                <select
                                    value={payload.status ?? 'confirmed'}
                                    onChange={(event) =>
                                        setPayload((current) => ({ ...current, status: event.target.value as AppointmentStatus }))
                                    }
                                    className={selectClass}
                                >
                                    {statuses.map((status) => (
                                        <option key={status.value} value={status.value}>
                                            {t(status.label)}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                    </div>

                    {partnerMode && mode === 'create' && (
                        <div className="flex items-center gap-2 rounded-md border border-accent/25 bg-accent/[0.06] px-3 py-2 text-xs text-muted-foreground">
                            <Info className="h-4 w-4 shrink-0 text-accent" />
                            {t('Votre réservation sera envoyée « En attente » — le salon la confirmera.')}
                        </div>
                    )}

                    <Field label={t('Notes')}>
                        <textarea
                            value={payload.notes ?? ''}
                            onChange={(event) => setPayload((current) => ({ ...current, notes: event.target.value }))}
                            placeholder={t('Préférence, remarque, acompte...')}
                            className={cn(selectClass, 'min-h-24 resize-y py-3')}
                        />
                    </Field>

                    {items.length > 0 && (
                        <div className="flex items-center justify-between rounded-md border border-accent/20 bg-accent/[0.06] px-3 py-2 text-xs text-muted-foreground">
                            <span>
                                {people.length} {t(people.length > 1 ? 'personnes' : 'personne')} · {items.length}{' '}
                                {t(items.length > 1 ? 'prestations' : 'prestation')} ·{' '}
                                {t('durée estimée {n} min', { n: totalDuration })}
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
                            {t('Supprimer')}
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('Annuler')}
                        </Button>
                        <Button type="button" variant="accent" disabled={!canSubmit || saving} onClick={submit}>
                            {saving && <Loader2 className="animate-spin" />}
                            {mode === 'edit' ? t('Enregistrer') : t('Créer la réservation')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>

            <ConfirmDialog
                open={confirmingDelete}
                onOpenChange={setConfirmingDelete}
                title={t('Supprimer cette réservation ?')}
                description={
                    appointment
                        ? t('La réservation de {name} sera définitivement supprimée.', {
                              name:
                                  appointment.client?.name ||
                                  appointment.clients?.map((c) => c.name).join(', ') ||
                                  t('ce client'),
                          })
                        : undefined
                }
                confirmLabel={t('Supprimer')}
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
    const { t } = useI18n();
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
                <span className="block text-xs text-muted-foreground">{service.duration_minutes} {t('min')}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                {formatCurrency(service.price, { maximumFractionDigits: 2 })}
            </span>
        </button>
    );
}
