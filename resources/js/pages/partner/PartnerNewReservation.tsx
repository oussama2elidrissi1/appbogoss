import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    Calendar as CalendarIcon,
    Check,
    ChevronRight,
    Clock,
    Copy,
    HandCoins,
    Info,
    Loader2,
    Plus,
    Search,
    Sparkles,
    User,
    UserPlus,
    XCircle,
} from 'lucide-react';
import {
    createAppointment,
    createClient,
    getErrorMessage,
    getPartnerPortalClients,
    getPartnerPortalServices,
} from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { generateIndicativeSlots } from '@/lib/indicativeSlots';
import { useReservationCart } from '@/components/agenda/useReservationCart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { pageFade } from '@/lib/motion';
import type { PartnerBookableService } from '@/types/partner-portal';
import type { Client, Service } from '@/types/workday';

const STEPS = ['Client', 'Participants', 'Prestations', 'Créneau', 'Récapitulatif'] as const;

type ContactClient = { id: number; name: string; phone: string | null };

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

export default function PartnerNewReservation() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [step, setStep] = useState(0);

    const [client, setClient] = useState<ContactClient | null>(null);
    const [date, setDate] = useState(todayIso());
    const [time, setTime] = useState<string | null>(null);

    const { data: bookableServices, isPending: servicesPending } = useQuery({
        queryKey: ['partner-portal', 'services'],
        queryFn: getPartnerPortalServices,
    });

    const bookableById = useMemo(
        () => new Map((bookableServices ?? []).map((service) => [service.service_id, service])),
        [bookableServices],
    );

    /** The cart hook works in terms of the generic Service shape — adapt the partner's authorized catalog to it. */
    const cartServices: Service[] = useMemo(
        () =>
            (bookableServices ?? []).map((service) => ({
                id: service.service_id,
                name: service.name,
                category: service.category ?? '',
                duration_minutes: service.duration_minutes,
                price: service.price,
                color: service.color ?? '#C8A24C',
                is_active: true,
            })),
        [bookableServices],
    );

    const cart = useReservationCart(cartServices);
    const {
        people,
        items,
        activePerson,
        setActivePerson,
        setPeople,
        totalPrice,
        personLabel,
        itemsOfPerson,
        addPerson,
        removePerson,
        renamePerson,
        addService,
        removeItemAt,
        duplicateServicesToAll,
        personsWithoutService,
    } = cart;

    const commissionTotal = items.reduce(
        (total, item) => total + (bookableById.get(item.service_id)?.commission_preview ?? 0),
        0,
    );

    function selectClient(candidate: ContactClient) {
        setClient(candidate);
        setPeople((current) => current.map((person, index) => (index === 0 ? { name: candidate.name } : person)));
    }

    const createMutation = useMutation({
        mutationFn: () =>
            createAppointment({
                client_id: client!.id,
                client_ids: [client!.id],
                people: people.map((person) => ({ name: person.name?.trim() || null })),
                items: items.map(({ service_id, employee_id, person_index }) => ({
                    service_id,
                    employee_id,
                    person_index,
                })),
                starts_at: `${date} ${time}:00`,
            }),
        onSuccess: (appointment) => {
            void queryClient.invalidateQueries({ queryKey: ['partner-portal'] });
            navigate(`/partner/reservations/${appointment.id}`, {
                state: { justCreated: true },
            });
        },
    });

    const canGoNext =
        (step === 0 && client !== null) ||
        (step === 1 && people.length > 0) ||
        (step === 2 && items.length > 0 && personsWithoutService.length === 0) ||
        (step === 3 && date.length > 0 && Boolean(time)) ||
        step === 4;

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="mx-auto max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Nouvelle réservation</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Réservez pour vos clients en quelques clics — plusieurs personnes, plusieurs prestations.
                </p>
            </div>

            <StepIndicator step={step} />

            <Card className="p-5 sm:p-6">
                {step === 0 && <ClientStep value={client} onChange={selectClient} />}
                {step === 1 && (
                    <ParticipantsStep
                        people={people}
                        contactName={client?.name ?? null}
                        onAddPerson={addPerson}
                        onRemovePerson={removePerson}
                        onRenamePerson={renamePerson}
                    />
                )}
                {step === 2 && (
                    <ServicesStep
                        people={people}
                        activePerson={activePerson}
                        onActivePersonChange={setActivePerson}
                        personLabel={personLabel}
                        itemsOfPerson={itemsOfPerson}
                        bookableServices={bookableServices ?? []}
                        bookableById={bookableById}
                        servicesPending={servicesPending}
                        onAddService={(service) => addService(toCartService(service), activePerson)}
                        onRemoveItem={removeItemAt}
                        onDuplicateToAll={() => duplicateServicesToAll(activePerson)}
                        canDuplicate={people.length > 1 && itemsOfPerson(activePerson).length > 0}
                    />
                )}
                {step === 3 && (
                    <SlotStep date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
                )}
                {step === 4 && client && (
                    <ReviewStep
                        client={client}
                        people={people}
                        itemsOfPerson={itemsOfPerson}
                        personLabel={personLabel}
                        bookableById={bookableById}
                        date={date}
                        time={time}
                        totalPrice={totalPrice}
                        commissionTotal={commissionTotal}
                    />
                )}

                {createMutation.isError && (
                    <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3 py-2.5">
                        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
                        <p className="text-xs text-destructive">{getErrorMessage(createMutation.error)}</p>
                    </div>
                )}

                <div className="mt-6 flex items-center justify-between border-t border-tint/[0.06] pt-5">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={step === 0}
                        onClick={() => setStep((s) => Math.max(0, s - 1))}
                    >
                        Précédent
                    </Button>

                    {step < STEPS.length - 1 ? (
                        <Button
                            type="button"
                            variant="accent"
                            disabled={!canGoNext}
                            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                        >
                            Suivant
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="accent"
                            disabled={createMutation.isPending}
                            onClick={() => createMutation.mutate()}
                        >
                            {createMutation.isPending && <Loader2 className="animate-spin" />}
                            <Check className="h-4 w-4" />
                            Confirmer la réservation
                        </Button>
                    )}
                </div>
            </Card>
        </motion.div>
    );
}

function toCartService(service: PartnerBookableService): Service {
    return {
        id: service.service_id,
        name: service.name,
        category: service.category ?? '',
        duration_minutes: service.duration_minutes,
        price: service.price,
        color: service.color ?? '#C8A24C',
        is_active: true,
    };
}

function StepIndicator({ step }: { step: number }) {
    return (
        <div className="flex items-center gap-1.5">
            {STEPS.map((label, index) => (
                <div key={label} className="flex flex-1 items-center gap-1.5">
                    <div
                        className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                            index < step
                                ? 'bg-accent text-accent-foreground'
                                : index === step
                                  ? 'bg-accent/[0.16] text-accent ring-1 ring-accent/40'
                                  : 'bg-tint/[0.06] text-muted-foreground',
                        )}
                    >
                        {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </div>
                    <span
                        className={cn(
                            'hidden truncate text-xs font-medium sm:block',
                            index <= step ? 'text-foreground' : 'text-muted-foreground',
                        )}
                    >
                        {label}
                    </span>
                    {index < STEPS.length - 1 && <div className="h-px flex-1 bg-tint/[0.08]" />}
                </div>
            ))}
        </div>
    );
}

function ClientStep({ value, onChange }: { value: ContactClient | null; onChange: (client: ContactClient) => void }) {
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');

    const { data: clients, isPending } = useQuery({
        queryKey: ['partner-portal', 'clients', search],
        queryFn: () => getPartnerPortalClients(search || undefined),
    });

    const createMutation = useMutation({
        mutationFn: () => createClient({ name: newName.trim(), phone: newPhone.trim() || null }),
        onSuccess: (client: Client) => {
            onChange({ id: client.id, name: client.name, phone: client.phone });
            setCreating(false);
        },
    });

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Étape 1 — Client
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    Choisissez le contact principal dans votre portefeuille, ou ajoutez-en un nouveau. Ses
                    coordonnées serviront pour tout le groupe.
                </p>
            </div>

            {!creating ? (
                <>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Rechercher parmi vos clients..."
                            className="pl-10"
                        />
                    </div>

                    <div className="max-h-64 space-y-1.5 overflow-y-auto">
                        {isPending ? (
                            Array.from({ length: 3 }).map((_, index) => (
                                <Skeleton key={index} className="h-14 w-full rounded-md" />
                            ))
                        ) : clients && clients.length > 0 ? (
                            clients.map((candidate) => (
                                <button
                                    key={candidate.id}
                                    type="button"
                                    onClick={() => onChange({ id: candidate.id, name: candidate.name, phone: candidate.phone })}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                                        value?.id === candidate.id
                                            ? 'border-accent/50 bg-accent/[0.08]'
                                            : 'border-tint/[0.06] bg-tint/[0.02] hover:border-tint/[0.14]',
                                    )}
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint/[0.06] text-xs font-semibold text-accent">
                                        {candidate.name.slice(0, 1).toUpperCase()}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium">{candidate.name}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {candidate.phone ?? 'Aucun téléphone'}
                                        </span>
                                    </span>
                                    {value?.id === candidate.id && <Check className="h-4 w-4 shrink-0 text-accent" />}
                                </button>
                            ))
                        ) : (
                            <p className="rounded-md border border-dashed border-tint/[0.1] px-3 py-6 text-center text-xs text-muted-foreground">
                                Aucun client ne correspond dans votre portefeuille.
                            </p>
                        )}
                    </div>

                    <Button type="button" variant="outline" className="w-full" onClick={() => setCreating(true)}>
                        <Plus className="h-4 w-4" />
                        Nouveau client
                    </Button>
                </>
            ) : (
                <div className="space-y-3 rounded-md border border-tint/[0.08] bg-tint/[0.02] p-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="new-client-name">Nom</Label>
                        <Input id="new-client-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nom du client" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="new-client-phone">Téléphone</Label>
                        <Input id="new-client-phone" value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="06 00 00 00 00" />
                    </div>
                    {createMutation.isError && (
                        <p className="text-xs text-destructive">{getErrorMessage(createMutation.error)}</p>
                    )}
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={createMutation.isPending}>
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            variant="accent"
                            className="flex-1"
                            disabled={!newName.trim() || createMutation.isPending}
                            onClick={() => createMutation.mutate()}
                        >
                            {createMutation.isPending && <Loader2 className="animate-spin" />}
                            Ajouter ce client
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ParticipantsStep({
    people,
    contactName,
    onAddPerson,
    onRemovePerson,
    onRenamePerson,
}: {
    people: Array<{ name: string | null }>;
    contactName: string | null;
    onAddPerson: () => void;
    onRemovePerson: (index: number) => void;
    onRenamePerson: (index: number, name: string) => void;
}) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Étape 2 — Participants
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    Une réservation peut concerner plusieurs personnes — ajoutez-les ici. Elles n'ont pas besoin
                    d'être des clients enregistrés, un simple prénom suffit.
                </p>
            </div>

            <div className="space-y-2">
                {people.map((person, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-tint/[0.1] bg-tint/[0.04] text-xs font-semibold text-muted-foreground">
                            {index + 1}
                        </span>
                        {index === 0 ? (
                            <div className="flex h-11 flex-1 items-center rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3.5 text-sm">
                                <span className="truncate font-medium">{contactName ?? 'Client titulaire'}</span>
                                <span className="ml-2 shrink-0 rounded-full bg-accent/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                    Contact principal
                                </span>
                            </div>
                        ) : (
                            <>
                                <Input
                                    value={person.name ?? ''}
                                    onChange={(event) => onRenamePerson(index, event.target.value)}
                                    placeholder={`Prénom de la personne ${index + 1} (facultatif)`}
                                />
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Retirer cette personne"
                                    onClick={() => onRemovePerson(index)}
                                >
                                    <XCircle className="text-destructive" />
                                </Button>
                            </>
                        )}
                    </div>
                ))}
                <Button type="button" variant="outline" className="w-full" disabled={people.length >= 20} onClick={onAddPerson}>
                    <UserPlus className="h-4 w-4" />
                    Ajouter une personne
                </Button>
            </div>
        </div>
    );
}

function ServicesStep({
    people,
    activePerson,
    onActivePersonChange,
    personLabel,
    itemsOfPerson,
    bookableServices,
    bookableById,
    servicesPending,
    onAddService,
    onRemoveItem,
    onDuplicateToAll,
    canDuplicate,
}: {
    people: Array<{ name: string | null }>;
    activePerson: number;
    onActivePersonChange: (index: number) => void;
    personLabel: (index: number) => string;
    itemsOfPerson: (index: number) => Array<{ item: { service_id: number }; itemIndex: number }>;
    bookableServices: PartnerBookableService[];
    bookableById: Map<number, PartnerBookableService>;
    servicesPending: boolean;
    onAddService: (service: PartnerBookableService) => void;
    onRemoveItem: (itemIndex: number) => void;
    onDuplicateToAll: () => void;
    canDuplicate: boolean;
}) {
    const activeItems = itemsOfPerson(activePerson);
    const subtotal = activeItems.reduce((total, { item }) => total + (bookableById.get(item.service_id)?.price ?? 0), 0);

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Étape 3 — Prestations par personne
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    Uniquement les prestations que BOGOSLAND vous autorise à réserver.
                </p>
            </div>

            <div className="flex flex-wrap gap-2">
                {people.map((_, index) => {
                    const count = itemsOfPerson(index).length;
                    const selected = activePerson === index;
                    return (
                        <button
                            key={index}
                            type="button"
                            onClick={() => onActivePersonChange(index)}
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
                                    count > 0 ? 'bg-accent text-accent-foreground' : 'bg-tint/[0.08] text-muted-foreground',
                                )}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {servicesPending ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-md" />
                    ))}
                </div>
            ) : bookableServices.length === 0 ? (
                <p className="rounded-md border border-dashed border-tint/[0.1] px-3 py-6 text-center text-xs text-muted-foreground">
                    Aucune offre ne vous a encore été attribuée — contactez BOGOSLAND.
                </p>
            ) : (
                <div className="grid max-h-56 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-2">
                    {bookableServices.map((service) => {
                        const count = activeItems.filter(({ item }) => item.service_id === service.service_id).length;
                        return (
                            <button
                                key={service.service_id}
                                type="button"
                                onClick={() => onAddService(service)}
                                className={cn(
                                    'relative flex flex-col items-start gap-1 rounded-md border px-4 py-3 text-left transition-all duration-200 active:scale-[0.98]',
                                    count > 0
                                        ? 'border-accent/60 bg-accent/[0.12] shadow-glow'
                                        : 'border-tint/[0.06] bg-tint/[0.02] hover:border-tint/[0.14]',
                                )}
                            >
                                {count > 0 && (
                                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground shadow-soft">
                                        {count}
                                    </span>
                                )}
                                <span className="text-sm font-medium">{service.name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {formatCurrency(service.price)} · {service.duration_minutes} min
                                </span>
                                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                                    <HandCoins className="h-3 w-3" />
                                    Commission {formatCurrency(service.commission_preview, { maximumFractionDigits: 2 })}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="space-y-2 rounded-md border border-tint/[0.07] bg-tint/[0.02] p-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">
                        Prestations de {personLabel(activePerson)}
                    </p>
                    {canDuplicate && (
                        <Button type="button" size="sm" variant="ghost" onClick={onDuplicateToAll}>
                            <Copy className="h-3.5 w-3.5" />
                            Appliquer à tous
                        </Button>
                    )}
                </div>
                {activeItems.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">Aucune prestation sélectionnée.</p>
                ) : (
                    <div className="space-y-1.5">
                        {activeItems.map(({ item, itemIndex }) => {
                            const service = bookableById.get(item.service_id);
                            return (
                                <div
                                    key={itemIndex}
                                    className="flex items-center justify-between gap-2 rounded-md border border-tint/[0.06] bg-background/40 px-3 py-2 text-sm"
                                >
                                    <span className="truncate">{service?.name ?? 'Prestation'}</span>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{formatCurrency(service?.price ?? 0)}</span>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            aria-label="Retirer cette prestation"
                                            onClick={() => onRemoveItem(itemIndex)}
                                        >
                                            <XCircle className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex items-center justify-between pt-1 text-xs font-semibold text-foreground">
                            <span>Sous-total</span>
                            <span className="text-accent">{formatCurrency(subtotal)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function SlotStep({
    date,
    time,
    onDateChange,
    onTimeChange,
}: {
    date: string;
    time: string | null;
    onDateChange: (value: string) => void;
    onTimeChange: (value: string) => void;
}) {
    const slots = useMemo(() => generateIndicativeSlots(date, 30), [date]);

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Étape 4 — Date & créneau
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">Quand votre client sera-t-il attendu au salon ?</p>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="reservation-date">
                    <CalendarIcon className="mr-1 inline h-3.5 w-3.5" />
                    Date
                </Label>
                <Input
                    id="reservation-date"
                    type="date"
                    min={todayIso()}
                    value={date}
                    onChange={(event) => {
                        onDateChange(event.target.value);
                        onTimeChange('');
                    }}
                />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="reservation-time">
                    <Clock className="mr-1 inline h-3.5 w-3.5" />
                    Heure
                </Label>
                <Input
                    id="reservation-time"
                    type="time"
                    value={time ?? ''}
                    onChange={(event) => onTimeChange(event.target.value)}
                />
            </div>

            {slots.length > 0 && (
                <div className="space-y-1.5">
                    <Label>Suggestions</Label>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {slots.map((slot) => (
                            <button
                                key={slot}
                                type="button"
                                onClick={() => onTimeChange(slot)}
                                className={cn(
                                    'rounded-md border px-2 py-2 text-center text-sm font-medium tabular-nums transition-colors',
                                    time === slot
                                        ? 'border-accent/60 bg-accent/[0.14] text-foreground'
                                        : 'border-tint/[0.08] bg-tint/[0.02] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                                )}
                            >
                                {slot}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex items-start gap-2 rounded-md border border-accent/25 bg-accent/[0.06] px-3 py-2.5 text-xs text-muted-foreground">
                <Info className="mt-px h-3.5 w-3.5 shrink-0 text-accent" />
                Ce créneau est indicatif — BOGOSLAND confirmera la disponibilité réelle au traitement de votre
                demande, et peut vous proposer un autre horaire si besoin.
            </div>
        </div>
    );
}

function ReviewStep({
    client,
    people,
    itemsOfPerson,
    personLabel,
    bookableById,
    date,
    time,
    totalPrice,
    commissionTotal,
}: {
    client: ContactClient;
    people: Array<{ name: string | null }>;
    itemsOfPerson: (index: number) => Array<{ item: { service_id: number }; itemIndex: number }>;
    personLabel: (index: number) => string;
    bookableById: Map<number, PartnerBookableService>;
    date: string;
    time: string | null;
    totalPrice: number;
    commissionTotal: number;
}) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Étape 5 — Récapitulatif
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">Vérifiez les informations avant de confirmer.</p>
            </div>

            <div className="space-y-3 rounded-md border border-tint/[0.07] bg-tint/[0.02] p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        Contact
                    </span>
                    <span className="font-medium text-foreground">
                        {client.name}
                        {client.phone ? ` · ${client.phone}` : ''}
                    </span>
                </div>

                <div className="border-t border-tint/[0.06] pt-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        {people.length} participant{people.length > 1 ? 's' : ''}
                    </p>
                    <div className="space-y-2.5">
                        {people.map((_, index) => {
                            const personItems = itemsOfPerson(index);
                            if (personItems.length === 0) return null;
                            const subtotal = personItems.reduce(
                                (total, { item }) => total + (bookableById.get(item.service_id)?.price ?? 0),
                                0,
                            );
                            return (
                                <div key={index} className="flex items-start justify-between gap-3 text-sm">
                                    <div>
                                        <p className="font-medium text-foreground">{personLabel(index)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {personItems
                                                .map(({ item }) => bookableById.get(item.service_id)?.name)
                                                .filter(Boolean)
                                                .join(', ')}
                                        </p>
                                    </div>
                                    <span className="shrink-0 font-medium text-foreground">{formatCurrency(subtotal)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-tint/[0.06] pt-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {formatDate(date)}
                    </div>
                    <div className="flex items-center justify-end gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {time ?? '—'}
                    </div>
                </div>

                <div className="border-t border-tint/[0.06] pt-2" />
                <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold">{formatCurrency(totalPrice)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Commission estimée</span>
                    <Badge variant="success">{formatCurrency(commissionTotal, { maximumFractionDigits: 2 })}</Badge>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                La réservation sera envoyée à BOGOSLAND pour confirmation — une référence unique lui sera
                attribuée dès sa création.
            </p>
        </div>
    );
}
