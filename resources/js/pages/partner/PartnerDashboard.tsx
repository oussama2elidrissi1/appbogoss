import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
    Activity,
    AlertCircle,
    ArrowRight,
    CalendarCheck,
    CalendarDays,
    CalendarPlus,
    HandCoins,
    ListChecks,
    Sparkles,
    Users,
    Wallet2,
} from 'lucide-react';
import { getErrorMessage, getPartnerPortalDashboard } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatCurrency, formatDate, formatRelativeTime, formatTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';
import type { PartnerActivityEvent, PartnerUpcomingReservation } from '@/types/partner-portal';

const RESERVATION_STATUS_META: Record<string, { label: string; variant: 'default' | 'accent' | 'destructive' }> = {
    pending: { label: 'En attente', variant: 'default' },
    confirmed: { label: 'Confirmée', variant: 'accent' },
    completed: { label: 'Terminée', variant: 'accent' },
    cancelled: { label: 'Annulée', variant: 'destructive' },
    no_show: { label: 'Absent(e)', variant: 'destructive' },
    refused: { label: 'Refusée', variant: 'destructive' },
};

const STATUS_LABEL: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' }> = {
    active: { label: 'Compte actif', variant: 'success' },
    pending: { label: 'Compte en attente', variant: 'outline' },
    suspended: { label: 'Compte suspendu', variant: 'destructive' },
    disabled: { label: 'Compte désactivé', variant: 'destructive' },
};

export default function PartnerDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const { data, isPending, isError, error, refetch } = useQuery({
        queryKey: ['partner-portal', 'dashboard'],
        queryFn: getPartnerPortalDashboard,
    });

    const firstName = (user?.partner_name ?? data?.partner_name ?? 'Partenaire').split(' ')[0];
    const statusMeta = data ? STATUS_LABEL[data.status] : null;

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        Bonjour, {firstName} <span aria-hidden>👋</span>
                    </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">Voici un aperçu de votre activité.</p>
                </div>
                {statusMeta && (
                    <Badge variant={statusMeta.variant} className="shrink-0">
                        {statusMeta.label}
                    </Badge>
                )}
            </div>

            {data && data.status !== 'active' && (
                <Card className="border-destructive/25 bg-destructive/[0.06] p-4 text-sm text-destructive">
                    {data.status === 'suspended' &&
                        'Votre compte est suspendu — vous pouvez consulter votre historique mais ne pouvez pas créer de nouvelle réservation. Contactez BOGOSLAND pour en savoir plus.'}
                    {data.status === 'pending' &&
                        'Votre compte est en attente de validation par BOGOSLAND avant de pouvoir réserver.'}
                    {data.status === 'disabled' && 'Votre compte est désactivé.'}
                </Card>
            )}

            {isError ? (
                <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                    <Button variant="accent" className="mt-4" onClick={() => void refetch()}>
                        Réessayer
                    </Button>
                </Card>
            ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <KpiCard
                        icon={CalendarDays}
                        label="Réservations aujourd'hui"
                        value={isPending ? null : String(data?.reservations_today ?? 0)}
                    />
                    <KpiCard
                        icon={CalendarCheck}
                        label="Réservations ce mois"
                        value={isPending ? null : String(data?.reservations_month ?? 0)}
                    />
                    <KpiCard
                        icon={ListChecks}
                        label="Réservations confirmées"
                        value={isPending ? null : String(data?.reservations_confirmed ?? 0)}
                    />
                    <KpiCard
                        icon={Wallet2}
                        label="Commission estimée"
                        value={isPending ? null : formatCurrency(data?.commission_estimated ?? 0)}
                        tone="accent"
                    />
                    <KpiCard
                        icon={HandCoins}
                        label="Commission validée"
                        value={isPending ? null : formatCurrency(data?.commission_validated ?? 0)}
                        tone="accent"
                    />
                    <KpiCard
                        icon={HandCoins}
                        label="Commission payée"
                        value={isPending ? null : formatCurrency(data?.commission_paid ?? 0)}
                        tone="success"
                    />
                </div>
            )}

            <Card className="relative overflow-hidden border-accent/25 bg-gradient-to-br from-accent/[0.10] via-transparent to-transparent p-6 sm:p-8">
                <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/[0.10] blur-3xl" />
                <div className="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight">Créez une nouvelle réservation</h2>
                        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                            Réservez pour vos clients en quelques clics.
                        </p>
                    </div>
                    <Button
                        variant="accent"
                        size="lg"
                        className="shrink-0 shadow-[0_8px_24px_-8px_rgba(200,162,76,0.55)]"
                        onClick={() => navigate('/partner/reservations/new')}
                    >
                        <CalendarPlus className="h-4 w-4" />
                        Créer une réservation
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <UpcomingReservationsCard
                    isPending={isPending}
                    reservations={data?.upcoming_reservations ?? []}
                />
                <RecentActivityCard isPending={isPending} events={data?.recent_activity ?? []} />
            </div>
        </motion.div>
    );
}

function UpcomingReservationsCard({
    isPending,
    reservations,
}: {
    isPending: boolean;
    reservations: PartnerUpcomingReservation[];
}) {
    return (
        <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CalendarDays className="h-4 w-4 text-accent" />
                    Prochaines réservations
                </h2>
                <Link to="/partner/agenda" className="text-xs font-medium text-accent hover:underline">
                    Voir mon agenda
                </Link>
            </div>

            {isPending ? (
                <div className="mt-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-14 w-full rounded-md" />
                    ))}
                </div>
            ) : reservations.length === 0 ? (
                <EmptyState
                    icon={CalendarDays}
                    title="Aucune réservation à venir"
                    description="Vos prochaines réservations apparaîtront ici."
                    className="mt-4"
                />
            ) : (
                <ul className="mt-4 space-y-2">
                    {reservations.map((reservation) => {
                        const status = RESERVATION_STATUS_META[reservation.status] ?? RESERVATION_STATUS_META.pending;
                        return (
                            <li key={reservation.id}>
                                <Link
                                    to={`/partner/reservations/${reservation.id}`}
                                    className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-2.5 transition-colors hover:border-accent/30 hover:bg-tint/[0.04]"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {reservation.client_name ?? 'Client'}
                                        </p>
                                        <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
                                            <span>
                                                {reservation.starts_at ? formatDate(reservation.starts_at) : '—'} ·{' '}
                                                {reservation.starts_at ? formatTime(reservation.starts_at) : '—'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {reservation.participants_count}
                                            </span>
                                        </p>
                                    </div>
                                    <Badge variant={status.variant} className="shrink-0 text-[10px]">
                                        {status.label}
                                    </Badge>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

function RecentActivityCard({ isPending, events }: { isPending: boolean; events: PartnerActivityEvent[] }) {
    const iconFor = (type: PartnerActivityEvent['type']) =>
        type === 'client_created' ? Users : type === 'commission_validated' ? HandCoins : Sparkles;

    return (
        <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Activity className="h-4 w-4 text-accent" />
                Activité récente
            </h2>

            {isPending ? (
                <div className="mt-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-10 w-full rounded-md" />
                    ))}
                </div>
            ) : events.length === 0 ? (
                <EmptyState
                    icon={Activity}
                    title="Aucune activité récente"
                    description="Vos actions récentes apparaîtront ici."
                    className="mt-4"
                />
            ) : (
                <ul className="mt-4 space-y-3">
                    {events.map((event, index) => {
                        const Icon = iconFor(event.type);
                        return (
                            <li key={`${event.type}-${index}`} className="flex items-start gap-2.5">
                                <span
                                    className={cn(
                                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                                        event.type === 'commission_validated'
                                            ? 'bg-success/[0.14] text-success'
                                            : 'bg-accent/[0.14] text-accent',
                                    )}
                                >
                                    <Icon className="h-3 w-3" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm text-foreground">{event.label}</p>
                                    {event.created_at && (
                                        <p className="text-xs text-muted-foreground">
                                            {formatRelativeTime(event.created_at)}
                                        </p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

function KpiCard({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: typeof CalendarCheck;
    label: string;
    value: string | null;
    tone?: 'accent' | 'success';
}) {
    return (
        <Card className="p-4">
            <span
                className={
                    'mb-3 flex h-8 w-8 items-center justify-center rounded-md ' +
                    (tone === 'success'
                        ? 'bg-success/[0.14] text-success'
                        : tone === 'accent'
                          ? 'bg-accent/[0.14] text-accent'
                          : 'bg-tint/[0.06] text-muted-foreground')
                }
            >
                <Icon className="h-4 w-4" />
            </span>
            <p className="text-xs text-muted-foreground">{label}</p>
            {value === null ? (
                <Skeleton className="mt-1.5 h-6 w-20" />
            ) : (
                <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
            )}
        </Card>
    );
}
