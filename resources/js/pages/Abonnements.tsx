import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import {
    AlertCircle,
    BadgeCheck,
    Ban,
    CalendarClock,
    CalendarPlus,
    History,
    Loader2,
    MoreHorizontal,
    Pause,
    Play,
    Plus,
    QrCode as QrCodeIcon,
    RefreshCw,
    ScanLine,
    Search,
    TrendingUp,
    Users,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    cancelClientSubscription,
    extendClientSubscription,
    getAdminSubscriptions,
    getErrorMessage,
    getSubscriptionPlans,
    getSubscriptionUsages,
    getSubscriptionsDashboard,
    purchaseSubscription,
    regenerateSubscriptionQr,
    renewClientSubscription,
    resumeClientSubscription,
    suspendClientSubscription,
} from '@/lib/api';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import type { AdminSubscription, AdminSubscriptionStatus } from '@/types/loyalty';
import { useAuth } from '@/hooks/useAuth';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ClientPicker, EMPTY_CLIENT_SELECTION, type ClientSelection } from '@/components/workday/ClientPicker';
import { pageFade } from '@/lib/motion';

const STATUS_META: Record<AdminSubscriptionStatus, { label: string; variant: BadgeProps['variant'] }> = {
    active: { label: 'Actif', variant: 'success' },
    suspended: { label: 'Suspendu', variant: 'default' },
    expired: { label: 'Expiré', variant: 'destructive' },
    cancelled: { label: 'Annulé', variant: 'destructive' },
};

const STATUS_FILTERS: Array<{ value: AdminSubscriptionStatus | 'all'; label: string }> = [
    { value: 'all', label: 'Tous' },
    { value: 'active', label: 'Actifs' },
    { value: 'suspended', label: 'Suspendus' },
    { value: 'expired', label: 'Expirés' },
    { value: 'cancelled', label: 'Annulés' },
];

type Tab = 'subscriptions' | 'history' | 'reports';

export default function Abonnements() {
    const { hasPermission } = useAuth();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const [tab, setTab] = useState<Tab>('subscriptions');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<AdminSubscriptionStatus | 'all'>('all');
    const [sellOpen, setSellOpen] = useState(false);
    const [qrTarget, setQrTarget] = useState<AdminSubscription | null>(null);
    const [actionTarget, setActionTarget] = useState<{
        type: 'suspend' | 'extend' | 'cancel' | 'renew' | 'regenerate';
        subscription: AdminSubscription;
    } | null>(null);

    const canSell = hasPermission('subscriptions.sell') || hasPermission('loyalty.redeem');
    const canManage = hasPermission('subscriptions.manage');
    const canSuspend = hasPermission('subscriptions.suspend');
    const canExtend = hasPermission('subscriptions.extend');

    const {
        data: subscriptions,
        isPending,
        isError,
        error,
    } = useQuery({
        queryKey: ['subscriptions', 'admin', statusFilter, search],
        queryFn: () =>
            getAdminSubscriptions({
                status: statusFilter === 'all' ? undefined : statusFilter,
                search: search || undefined,
            }),
    });

    // Deep link from the scanner's "Renouveler" button.
    useEffect(() => {
        const renewId = searchParams.get('renew');
        if (renewId && subscriptions) {
            const target = subscriptions.find((subscription) => subscription.id === Number(renewId));
            if (target) setActionTarget({ type: 'renew', subscription: target });
        }
    }, [searchParams, subscriptions]);

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    }

    return (
        <>
            <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight">Abonnements clients</h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Suivi des abonnements vendus, historique des visites et performance du programme.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline">
                            <Link to="/scanner-abonnements">
                                <ScanLine />
                                Scanner
                            </Link>
                        </Button>
                        {canSell && (
                            <Button variant="accent" onClick={() => setSellOpen(true)}>
                                <Plus />
                                Nouvel abonnement
                            </Button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 rounded-md border border-tint/[0.08] bg-tint/[0.03] p-1 sm:w-fit">
                    {(
                        [
                            { value: 'subscriptions', label: 'Abonnés', icon: BadgeCheck },
                            { value: 'history', label: 'Historique', icon: History },
                            { value: 'reports', label: 'Rapports', icon: TrendingUp },
                        ] as Array<{ value: Tab; label: string; icon: typeof BadgeCheck }>
                    ).map((option) => {
                        const Icon = option.icon;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setTab(option.value)}
                                className={cn(
                                    'flex flex-1 items-center justify-center gap-1.5 rounded-sm px-4 py-1.5 text-xs font-medium transition-colors duration-200 sm:flex-none',
                                    tab === option.value
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

                {tab === 'subscriptions' && (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative max-w-xs flex-1">
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                <Input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Client, téléphone..."
                                    className="pl-10"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {STATUS_FILTERS.map((filter) => (
                                    <button
                                        key={filter.value}
                                        type="button"
                                        onClick={() => setStatusFilter(filter.value)}
                                        className={cn(
                                            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                            statusFilter === filter.value
                                                ? 'border-accent/60 bg-accent/[0.12] text-foreground'
                                                : 'border-tint/[0.08] bg-tint/[0.02] text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {isPending ? (
                            <div className="space-y-2">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <Skeleton key={index} className="h-24 rounded-md" />
                                ))}
                            </div>
                        ) : isError ? (
                            <Card className="flex flex-col items-center px-6 py-10 text-center">
                                <AlertCircle className="h-5 w-5 text-destructive" />
                                <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                            </Card>
                        ) : !subscriptions || subscriptions.length === 0 ? (
                            <EmptyState
                                icon={CalendarClock}
                                title="Aucun abonnement"
                                description="Vendez un premier abonnement pour le voir apparaître ici."
                            />
                        ) : (
                            <div className="space-y-2">
                                {subscriptions.map((subscription) => (
                                    <SubscriptionRow
                                        key={subscription.id}
                                        subscription={subscription}
                                        canManage={canManage}
                                        canSell={canSell}
                                        canSuspend={canSuspend}
                                        canExtend={canExtend}
                                        onShowQr={() => setQrTarget(subscription)}
                                        onAction={(type) => setActionTarget({ type, subscription })}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {tab === 'history' && <UsageHistory />}
                {tab === 'reports' && <SubscriptionReports />}
            </motion.div>

            <SellSubscriptionDialog
                open={sellOpen}
                onOpenChange={setSellOpen}
                onSold={() => {
                    invalidate();
                    setSellOpen(false);
                }}
            />

            <QrDialog subscription={qrTarget} onClose={() => setQrTarget(null)} />

            <LifecycleDialog
                action={actionTarget}
                onClose={() => setActionTarget(null)}
                onDone={() => {
                    invalidate();
                    setActionTarget(null);
                }}
            />
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function SubscriptionRow({
    subscription,
    canManage,
    canSell,
    canSuspend,
    canExtend,
    onShowQr,
    onAction,
}: {
    subscription: AdminSubscription;
    canManage: boolean;
    canSell: boolean;
    canSuspend: boolean;
    canExtend: boolean;
    onShowQr: () => void;
    onAction: (type: 'suspend' | 'extend' | 'cancel' | 'renew' | 'regenerate') => void;
}) {
    const status = STATUS_META[subscription.status];
    const isActive = subscription.status === 'active';
    const isSuspended = subscription.status === 'suspended';

    return (
        <Card className={cn(!isActive && !isSuspended && 'opacity-70')}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-[11rem] flex-1">
                    <p className="truncate text-sm font-semibold">{subscription.client.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {subscription.plan.name} · {formatCurrency(subscription.price_paid, { maximumFractionDigits: 0 })}
                        {subscription.client.phone ? ` · ${subscription.client.phone}` : ''}
                    </p>
                </div>

                <div className="w-32 shrink-0 text-xs text-muted-foreground">
                    <p>Du {formatDate(subscription.starts_on)}</p>
                    <p>au {formatDate(subscription.ends_on)}</p>
                </div>

                <div className="w-28 shrink-0">
                    <p className="text-sm font-bold tabular-nums text-accent">
                        {subscription.total_visits !== null
                            ? `${subscription.used_visits} / ${subscription.total_visits}`
                            : `${subscription.used_visits} visites`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                        {subscription.total_visits !== null
                            ? `${Math.max(0, subscription.total_visits - subscription.used_visits)} restantes`
                            : 'Illimité'}
                    </p>
                </div>

                <Badge variant={status.variant} className="shrink-0">
                    {status.label}
                </Badge>

                <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" size="icon" variant="ghost" aria-label="Afficher le QR" onClick={onShowQr}>
                        <QrCodeIcon />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" size="icon" variant="ghost" aria-label="Actions">
                                <MoreHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {canSell && subscription.plan.allow_renewal && (
                                <DropdownMenuItem onClick={() => onAction('renew')}>
                                    <RefreshCw className="h-4 w-4" />
                                    Renouveler
                                </DropdownMenuItem>
                            )}
                            {canSuspend && isActive && subscription.plan.allow_suspension && (
                                <DropdownMenuItem onClick={() => onAction('suspend')}>
                                    <Pause className="h-4 w-4" />
                                    Suspendre
                                </DropdownMenuItem>
                            )}
                            {canSuspend && isSuspended && (
                                <DropdownMenuItem onClick={() => onAction('suspend')}>
                                    <Play className="h-4 w-4" />
                                    Réactiver
                                </DropdownMenuItem>
                            )}
                            {canExtend && (isActive || isSuspended) && (
                                <DropdownMenuItem onClick={() => onAction('extend')}>
                                    <CalendarPlus className="h-4 w-4" />
                                    Prolonger
                                </DropdownMenuItem>
                            )}
                            {canManage && (
                                <DropdownMenuItem onClick={() => onAction('regenerate')}>
                                    <QrCodeIcon className="h-4 w-4" />
                                    Régénérer le QR
                                </DropdownMenuItem>
                            )}
                            {canManage && (isActive || isSuspended) && (
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => onAction('cancel')}
                                >
                                    <Ban className="h-4 w-4" />
                                    Annuler l'abonnement
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardContent>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* History tab                                                         */
/* ------------------------------------------------------------------ */

function UsageHistory() {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');

    const { data: usages, isPending } = useQuery({
        queryKey: ['subscriptions', 'usages', from, to, status, search],
        queryFn: () =>
            getSubscriptionUsages({
                from: from || undefined,
                to: to || undefined,
                status: status || undefined,
                search: search || undefined,
            }),
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <div className="relative max-w-xs flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client..." className="pl-10" />
                </div>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="Du" />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="Au" />
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="h-11 rounded-md border border-input bg-tint/[0.03] px-3 text-sm"
                >
                    <option value="">Tous statuts</option>
                    <option value="confirmed">Validées</option>
                    <option value="reserved">Réservées</option>
                    <option value="voided">Annulées</option>
                </select>
            </div>

            {isPending ? (
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} className="h-14 rounded-md" />
                    ))}
                </div>
            ) : !usages || usages.length === 0 ? (
                <EmptyState icon={History} title="Aucune visite" description="Les visites validées apparaîtront ici." />
            ) : (
                <div className="space-y-1.5">
                    {usages.map((usage) => (
                        <div
                            key={usage.id}
                            className={cn(
                                'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-4 py-2.5',
                                usage.status === 'voided' && 'opacity-60',
                            )}
                        >
                            <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
                                {usage.used_at ? `${formatDate(usage.used_at)} · ${formatTime(usage.used_at)}` : usage.used_on ? formatDate(usage.used_on) : '—'}
                            </span>
                            <span className="min-w-[8rem] flex-1 truncate text-sm font-medium">{usage.client_name ?? '—'}</span>
                            <span className="hidden w-36 shrink-0 truncate text-xs text-muted-foreground md:block">{usage.plan_name}</span>
                            <span className="min-w-[7rem] flex-1 truncate text-sm">{usage.service_name}</span>
                            <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground lg:block">
                                {usage.employee_name ?? '—'}
                            </span>
                            <span className="hidden w-16 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/70 sm:block">
                                {usage.channel === 'scanner' ? 'Scanner' : 'Caisse'}
                            </span>
                            <Badge
                                variant={usage.status === 'voided' ? 'destructive' : usage.status === 'confirmed' ? 'success' : 'default'}
                                className="shrink-0"
                            >
                                {usage.status === 'confirmed' ? 'Validée' : usage.status === 'reserved' ? 'Réservée' : 'Annulée'}
                            </Badge>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Reports tab                                                         */
/* ------------------------------------------------------------------ */

function SubscriptionReports() {
    const { data, isPending } = useQuery({
        queryKey: ['subscriptions', 'dashboard'],
        queryFn: getSubscriptionsDashboard,
    });

    if (isPending || !data) {
        return (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-24 rounded-md" />
                ))}
            </div>
        );
    }

    const maxPlan = Math.max(1, ...data.top_plans.map((p) => p.count));
    const maxService = Math.max(1, ...data.top_services.map((s) => s.count));

    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard icon={Users} label="Abonnements actifs" value={String(data.active_count)} />
                <KpiCard
                    icon={TrendingUp}
                    label="Vendus ce mois"
                    value={String(data.sold_this_month)}
                    sub={formatCurrency(data.revenue_this_month, { maximumFractionDigits: 0 })}
                />
                <KpiCard icon={ScanLine} label="Visites aujourd'hui" value={String(data.visits_today)} sub={`${data.visits_this_month} ce mois`} />
                <KpiCard
                    icon={CalendarClock}
                    label="Expirent sous 7 jours"
                    value={String(data.expiring_soon_count)}
                    tone={data.expiring_soon_count > 0 ? 'warn' : undefined}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardContent className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Plans les plus actifs</p>
                        <div className="mt-3 space-y-2.5">
                            {data.top_plans.length === 0 && <p className="text-xs text-muted-foreground">Aucune donnée.</p>}
                            {data.top_plans.map((plan) => (
                                <BarRow key={plan.plan_name} label={plan.plan_name} count={plan.count} max={maxPlan} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Services les plus utilisés (mois)</p>
                        <div className="mt-3 space-y-2.5">
                            {data.top_services.length === 0 && <p className="text-xs text-muted-foreground">Aucune donnée.</p>}
                            {data.top_services.map((service) => (
                                <BarRow key={service.service_name} label={service.service_name} count={service.count} max={maxService} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {data.expiring_soon.length > 0 && (
                <Card>
                    <CardContent className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Expirent bientôt</p>
                        <div className="mt-3 space-y-1.5">
                            {data.expiring_soon.map((row) => (
                                <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-2">
                                    <span className="min-w-0 truncate text-sm">
                                        <span className="font-medium">{row.client_name}</span>
                                        <span className="text-muted-foreground"> · {row.plan_name}</span>
                                    </span>
                                    <span className="shrink-0 text-xs font-semibold text-destructive">{formatDate(row.ends_on)}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function KpiCard({
    icon: Icon,
    label,
    value,
    sub,
    tone,
}: {
    icon: typeof Users;
    label: string;
    value: string;
    sub?: string;
    tone?: 'warn';
}) {
    return (
        <Card>
            <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                </p>
                <p className={cn('mt-2 text-2xl font-bold tabular-nums', tone === 'warn' ? 'text-destructive' : 'text-foreground')}>
                    {value}
                </p>
                {sub && <p className="mt-0.5 text-xs text-accent">{sub}</p>}
            </CardContent>
        </Card>
    );
}

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
    return (
        <div className="flex items-center gap-3">
            <span className="w-40 truncate text-xs text-muted-foreground">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-tint/[0.06]">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent"
                    style={{ width: `${Math.round((count / max) * 100)}%` }}
                />
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">{count}</span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Sell dialog                                                         */
/* ------------------------------------------------------------------ */

function SellSubscriptionDialog({
    open,
    onOpenChange,
    onSold,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSold: () => void;
}) {
    const [clientSelection, setClientSelection] = useState<ClientSelection>(EMPTY_CLIENT_SELECTION);
    const [planId, setPlanId] = useState<number | ''>('');
    const [paymentMethod, setPaymentMethod] = useState('especes');
    const [startsOn, setStartsOn] = useState('');

    const { data: plans } = useQuery({
        queryKey: ['subscription-plans'],
        queryFn: getSubscriptionPlans,
        enabled: open,
    });

    useEffect(() => {
        if (!open) {
            setClientSelection(EMPTY_CLIENT_SELECTION);
            setPlanId('');
            setPaymentMethod('especes');
            setStartsOn('');
        }
    }, [open]);

    const sellMutation = useMutation({
        mutationFn: () =>
            purchaseSubscription(clientSelection.client!.id, {
                subscription_plan_id: planId as number,
                payment_method: paymentMethod,
                ...(startsOn ? { starts_on: startsOn } : {}),
            }),
        onSuccess: onSold,
    });

    const activePlans = useMemo(() => (plans ?? []).filter((plan) => plan.is_active), [plans]);
    const selectedPlan = activePlans.find((plan) => plan.id === planId);
    const canSubmit =
        clientSelection.mode === 'client' &&
        clientSelection.client !== null &&
        planId !== '' &&
        !sellMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Vendre un abonnement</DialogTitle>
                    <DialogDescription>
                        Le paiement est encaissé immédiatement et le QR personnel du client est généré à
                        l'activation.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Client</p>
                        <ClientPicker value={clientSelection} onChange={setClientSelection} />
                    </div>

                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Plan</p>
                        <div className="grid gap-2">
                            {activePlans.map((plan) => (
                                <button
                                    key={plan.id}
                                    type="button"
                                    onClick={() => setPlanId(plan.id)}
                                    className={cn(
                                        'flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left transition-colors',
                                        planId === plan.id
                                            ? 'border-accent/60 bg-accent/[0.12]'
                                            : 'border-tint/[0.08] bg-tint/[0.02] hover:border-accent/30',
                                    )}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{plan.name}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {plan.duration_value}{' '}
                                            {plan.duration_unit === 'days' ? 'jours' : plan.duration_unit === 'weeks' ? 'semaines' : 'mois'}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold text-accent">
                                        {formatCurrency(plan.price, { maximumFractionDigits: 0 })}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Paiement</span>
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="mt-2 flex h-11 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm"
                            >
                                <option value="especes">Espèces</option>
                                <option value="carte">Carte</option>
                                <option value="virement">Virement</option>
                                <option value="autre">Autre</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Début (optionnel)</span>
                            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="mt-2" />
                        </label>
                    </div>

                    {sellMutation.isError && (
                        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {getErrorMessage(sellMutation.error)}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Annuler
                    </Button>
                    <Button type="button" variant="accent" disabled={!canSubmit} onClick={() => sellMutation.mutate()}>
                        {sellMutation.isPending && <Loader2 className="animate-spin" />}
                        Activer l'abonnement
                        {selectedPlan ? ` — ${formatCurrency(selectedPlan.price, { maximumFractionDigits: 0 })}` : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* QR dialog                                                           */
/* ------------------------------------------------------------------ */

function QrDialog({ subscription, onClose }: { subscription: AdminSubscription | null; onClose: () => void }) {
    const [dataUrl, setDataUrl] = useState<string | null>(null);

    useEffect(() => {
        if (subscription?.qr_token) {
            void QRCode.toDataURL(subscription.qr_token, { width: 480, margin: 2 }).then(setDataUrl);
        } else {
            setDataUrl(null);
        }
    }, [subscription]);

    return (
        <Dialog open={subscription !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>QR de l'abonnement</DialogTitle>
                    <DialogDescription>
                        {subscription?.client.name} — {subscription?.plan.name}. Le client retrouve ce même QR
                        dans son espace « Mon BOGOSLAND ».
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-center py-2">
                    {dataUrl ? (
                        <img src={dataUrl} alt="QR abonnement" className="h-60 w-60 rounded-md bg-white p-3" />
                    ) : (
                        <Skeleton className="h-60 w-60 rounded-md" />
                    )}
                </div>
                <DialogFooter>
                    <Button type="button" variant="accent" onClick={onClose}>
                        Fermer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Lifecycle dialog (suspend / extend / cancel / renew / regenerate)   */
/* ------------------------------------------------------------------ */

function LifecycleDialog({
    action,
    onClose,
    onDone,
}: {
    action: { type: 'suspend' | 'extend' | 'cancel' | 'renew' | 'regenerate'; subscription: AdminSubscription } | null;
    onClose: () => void;
    onDone: () => void;
}) {
    const [reason, setReason] = useState('');
    const [days, setDays] = useState('7');
    const [from, setFrom] = useState('');
    const [until, setUntil] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('especes');
    const [refund, setRefund] = useState(true);

    useEffect(() => {
        setReason('');
        setDays('7');
        setFrom('');
        setUntil('');
        setPaymentMethod('especes');
        setRefund(true);
    }, [action]);

    const mutation = useMutation({
        mutationFn: async () => {
            if (!action) return;
            const { type, subscription } = action;
            if (type === 'suspend') {
                if (subscription.status === 'suspended') {
                    await resumeClientSubscription(subscription.id);
                } else {
                    await suspendClientSubscription(subscription.id, { from, until, reason });
                }
            } else if (type === 'extend') {
                await extendClientSubscription(subscription.id, { days: Number(days), reason });
            } else if (type === 'cancel') {
                await cancelClientSubscription(subscription.id, { reason: reason || undefined, refund });
            } else if (type === 'renew') {
                await renewClientSubscription(subscription.id, { payment_method: paymentMethod });
            } else if (type === 'regenerate') {
                await regenerateSubscriptionQr(subscription.id);
            }
        },
        onSuccess: onDone,
    });

    if (!action) return null;
    const { type, subscription } = action;
    const isResume = type === 'suspend' && subscription.status === 'suspended';

    const titles: Record<string, string> = {
        suspend: isResume ? "Réactiver l'abonnement" : "Suspendre l'abonnement",
        extend: "Prolonger l'abonnement",
        cancel: "Annuler l'abonnement",
        renew: "Renouveler l'abonnement",
        regenerate: 'Régénérer le QR',
    };

    const canSubmit =
        type === 'renew' ||
        type === 'regenerate' ||
        isResume ||
        (type === 'suspend' && from !== '' && until !== '' && reason.trim() !== '') ||
        (type === 'extend' && Number(days) > 0 && reason.trim() !== '') ||
        type === 'cancel';

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{titles[type]}</DialogTitle>
                    <DialogDescription>
                        {subscription.client.name} — {subscription.plan.name}
                        {type === 'suspend' && !isResume && " · la date d'expiration sera prolongée d'autant."}
                        {type === 'renew' && ' · une nouvelle période sera créée, l’historique est conservé.'}
                        {type === 'regenerate' && " · l'ancien QR ne fonctionnera plus."}
                        {type === 'cancel' && ' · cette action est définitive.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    {type === 'suspend' && !isResume && (
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Du</span>
                                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-2" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Au</span>
                                <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-2" />
                            </label>
                        </div>
                    )}
                    {type === 'extend' && (
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Jours ajoutés</span>
                            <Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className="mt-2" />
                        </label>
                    )}
                    {type === 'renew' && (
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Paiement</span>
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="mt-2 flex h-11 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm"
                            >
                                <option value="especes">Espèces</option>
                                <option value="carte">Carte</option>
                                <option value="virement">Virement</option>
                                <option value="autre">Autre</option>
                            </select>
                        </label>
                    )}
                    {['suspend', 'extend', 'cancel'].includes(type) && !isResume && (
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Motif{type === 'cancel' ? ' (optionnel)' : ''}
                            </span>
                            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Raison..." className="mt-2" />
                        </label>
                    )}
                    {type === 'cancel' && (
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-tint/[0.08] bg-tint/[0.02] px-3.5 py-3">
                            <input
                                type="checkbox"
                                checked={refund}
                                onChange={(event) => setRefund(event.target.checked)}
                                className="mt-0.5 h-4 w-4 accent-[#C8A24C]"
                            />
                            <span className="text-sm leading-snug">
                                Rembourser la vente ({formatCurrency(subscription.price_paid, { maximumFractionDigits: 0 })})
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    Le ticket est retiré de l'encaissé de la caisse et marqué « supprimé » —
                                    à cocher si l'argent est réellement rendu au client.
                                </span>
                            </span>
                        </label>
                    )}

                    {mutation.isError && (
                        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {getErrorMessage(mutation.error)}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Fermer
                    </Button>
                    <Button
                        type="button"
                        variant={type === 'cancel' ? 'destructive' : 'accent'}
                        disabled={!canSubmit || mutation.isPending}
                        onClick={() => mutation.mutate()}
                    >
                        {mutation.isPending && <Loader2 className="animate-spin" />}
                        Confirmer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
