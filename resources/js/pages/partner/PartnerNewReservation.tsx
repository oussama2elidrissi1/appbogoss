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
    HandCoins,
    Loader2,
    Plus,
    Search,
    Sparkles,
    User,
} from 'lucide-react';
import {
    createAppointment,
    createClient,
    getErrorMessage,
    getPartnerPortalClients,
    getPartnerPortalServices,
} from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { pageFade } from '@/lib/motion';
import type { PartnerBookableService } from '@/types/partner-portal';
import type { Client } from '@/types/workday';

const STEPS = ['Client', 'Offre', 'Date & heure', 'Récapitulatif'] as const;

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

export default function PartnerNewReservation() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [step, setStep] = useState(0);

    const [client, setClient] = useState<Client | { id: number; name: string; phone: string | null } | null>(null);
    const [service, setService] = useState<PartnerBookableService | null>(null);
    const [date, setDate] = useState(todayIso());
    const [time, setTime] = useState('15:00');

    const createMutation = useMutation({
        mutationFn: () =>
            createAppointment({
                client_id: client!.id,
                starts_at: `${date} ${time}:00`,
                items: [{ service_id: service!.service_id, employee_id: null }],
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
        (step === 1 && service !== null) ||
        (step === 2 && date.length > 0 && time.length > 0) ||
        step === 3;

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="mx-auto max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Nouvelle réservation</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Réservez pour vos clients en quelques clics.
                </p>
            </div>

            <StepIndicator step={step} />

            <Card className="p-5 sm:p-6">
                {step === 0 && <ClientStep value={client} onChange={setClient} />}
                {step === 1 && <ServiceStep value={service} onChange={setService} />}
                {step === 2 && <DateTimeStep date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />}
                {step === 3 && client && service && (
                    <ReviewStep client={client} service={service} date={date} time={time} />
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

function ClientStep({
    value,
    onChange,
}: {
    value: { id: number; name: string; phone: string | null } | null;
    onChange: (client: { id: number; name: string; phone: string | null }) => void;
}) {
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
        onSuccess: (client) => {
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
                    Choisissez un client de votre portefeuille, ou ajoutez-en un nouveau.
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

function ServiceStep({
    value,
    onChange,
}: {
    value: PartnerBookableService | null;
    onChange: (service: PartnerBookableService) => void;
}) {
    const { data: services, isPending } = useQuery({
        queryKey: ['partner-portal', 'services'],
        queryFn: getPartnerPortalServices,
    });

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Étape 2 — Offre / Service
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    Uniquement les prestations que BOGOSLAND vous autorise à réserver.
                </p>
            </div>

            {isPending ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-md" />
                    ))}
                </div>
            ) : services && services.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                    {services.map((candidate) => (
                        <button
                            key={candidate.service_id}
                            type="button"
                            onClick={() => onChange(candidate)}
                            className={cn(
                                'flex flex-col items-start gap-1 rounded-md border px-4 py-3 text-left transition-colors',
                                value?.service_id === candidate.service_id
                                    ? 'border-accent/50 bg-accent/[0.08]'
                                    : 'border-tint/[0.06] bg-tint/[0.02] hover:border-tint/[0.14]',
                            )}
                        >
                            <span className="flex w-full items-center justify-between gap-2">
                                <span className="text-sm font-medium">{candidate.name}</span>
                                {value?.service_id === candidate.service_id && (
                                    <Check className="h-4 w-4 shrink-0 text-accent" />
                                )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {formatCurrency(candidate.price)} · {candidate.duration_minutes} min
                            </span>
                            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                                <HandCoins className="h-3 w-3" />
                                Commission {formatCurrency(candidate.commission_preview, { maximumFractionDigits: 2 })}
                            </span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="rounded-md border border-dashed border-tint/[0.1] px-3 py-6 text-center text-xs text-muted-foreground">
                    Aucune offre ne vous a encore été attribuée — contactez BOGOSLAND.
                </p>
            )}
        </div>
    );
}

function DateTimeStep({
    date,
    time,
    onDateChange,
    onTimeChange,
}: {
    date: string;
    time: string;
    onDateChange: (value: string) => void;
    onTimeChange: (value: string) => void;
}) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Étape 3 — Date & heure
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">Quand votre client sera-t-il attendu au salon ?</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                        onChange={(event) => onDateChange(event.target.value)}
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
                        value={time}
                        onChange={(event) => onTimeChange(event.target.value)}
                    />
                </div>
            </div>
        </div>
    );
}

function ReviewStep({
    client,
    service,
    date,
    time,
}: {
    client: { id: number; name: string; phone: string | null };
    service: PartnerBookableService;
    date: string;
    time: string;
}) {
    const rows = useMemo(
        () => [
            { icon: User, label: 'Client', value: client.name + (client.phone ? ` · ${client.phone}` : '') },
            { icon: Sparkles, label: 'Service', value: service.name },
            { icon: CalendarIcon, label: 'Date', value: formatDate(date) },
            { icon: Clock, label: 'Heure', value: time },
        ],
        [client, service, date, time],
    );

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Étape 4 — Récapitulatif
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    Vérifiez les informations avant de confirmer.
                </p>
            </div>

            <div className="space-y-2 rounded-md border border-tint/[0.07] bg-tint/[0.02] p-4">
                {rows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <row.icon className="h-3.5 w-3.5" />
                            {row.label}
                        </span>
                        <span className="font-medium text-foreground">{row.value}</span>
                    </div>
                ))}
                <div className="border-t border-tint/[0.06] pt-2" />
                <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Prix</span>
                    <span className="font-medium">{formatCurrency(service.price)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Commission estimée</span>
                    <Badge variant="success">{formatCurrency(service.commission_preview, { maximumFractionDigits: 2 })}</Badge>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                La réservation sera envoyée à BOGOSLAND pour confirmation — une référence unique lui sera
                attribuée dès sa création.
            </p>
        </div>
    );
}
