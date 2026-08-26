import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import {
    AlertCircle,
    ArrowLeft,
    BadgeCheck,
    Cake,
    CalendarClock,
    CheckCircle2,
    ChevronRight,
    Gift,
    History,
    KeyRound,
    Loader2,
    Mail,
    Pencil,
    Phone,
    Plus,
    QrCode as QrCodeIcon,
    RefreshCw,
    ShieldCheck,
    ShoppingBag,
    Smartphone,
    Wallet,
    XCircle,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    getAdminSubscriptions,
    getClientLoyaltyStatus,
    getClientOverview,
    getClientPersonalQr,
    getErrorMessage,
    getSubscriptionPlans,
    purchaseSubscription,
    regenerateClientPersonalQr,
    setClientPortalPassword,
    updateClient,
} from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import type { ClientOverview, ClientPayload } from '@/types/workday';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CredentialRow } from '@/components/workday/CredentialRow';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';
import { pageFade } from '@/lib/motion';

const SUBSCRIPTION_STATUS: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    active: { label: 'Actif', variant: 'success' },
    suspended: { label: 'Suspendu', variant: 'default' },
    expired: { label: 'Expiré', variant: 'destructive' },
    cancelled: { label: 'Annulé', variant: 'destructive' },
};

const APPOINTMENT_STATUS: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    pending: { label: 'En attente', variant: 'default' },
    confirmed: { label: 'Confirmé', variant: 'accent' },
    completed: { label: 'Terminé', variant: 'success' },
    cancelled: { label: 'Annulé', variant: 'destructive' },
    no_show: { label: 'Absent', variant: 'destructive' },
};

const GENDER_LABELS: Record<string, string> = { female: 'Femme', male: 'Homme', other: 'Autre' };

export default function ClientDetail() {
    const { id } = useParams();
    const clientId = Number(id);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { hasPermission } = useAuth();
    const { t } = useI18n();

    const [editOpen, setEditOpen] = useState(false);
    const [sellOpen, setSellOpen] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const [credentials, setCredentials] = useState<{ phone: string | null; password: string } | null>(null);

    const overviewQuery = useQuery({
        queryKey: ['clients', clientId, 'overview'],
        queryFn: () => getClientOverview(clientId),
        enabled: Number.isFinite(clientId),
    });

    const subscriptionsQuery = useQuery({
        queryKey: ['subscriptions', 'client', clientId],
        queryFn: () => getAdminSubscriptions({ clientId }),
        enabled: Number.isFinite(clientId) && hasPermission('subscriptions.view'),
    });

    const loyaltyQuery = useQuery({
        queryKey: ['clients', clientId, 'loyalty'],
        queryFn: () => getClientLoyaltyStatus(clientId),
        enabled: Number.isFinite(clientId) && hasPermission('loyalty.redeem'),
    });

    const portalPasswordMutation = useMutation({
        mutationFn: () => setClientPortalPassword(clientId),
        onSuccess: (result) => {
            setCredentials({ phone: result.phone, password: result.temporary_password });
            void queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'overview'] });
        },
    });

    if (overviewQuery.isPending) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 rounded-md" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 rounded-md" />
                    ))}
                </div>
                <Skeleton className="h-64 rounded-md" />
            </div>
        );
    }

    if (overviewQuery.isError || !overviewQuery.data) {
        return (
            <Card className="flex flex-col items-center px-6 py-14 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <p className="mt-3 text-sm text-destructive">{getErrorMessage(overviewQuery.error)}</p>
                <Button variant="outline" className="mt-5" onClick={() => navigate('/clients')}>
                    <ArrowLeft />
                    {t('Retour aux clients')}
                </Button>
            </Card>
        );
    }

    const { client, portal, stats, recent_sales, recent_appointments } = overviewQuery.data;
    const subscriptions = subscriptionsQuery.data ?? [];
    const loyalty = loyaltyQuery.data;

    return (
        <>
            <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-5">
                <Link
                    to="/clients"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('Clients')}
                </Link>

                {/* ------------------------------------------------ header */}
                <Card>
                    <CardContent className="flex flex-wrap items-center gap-5 p-5">
                        <EmployeeAvatar name={client.name} color={client.avatar_color ?? '#4C7CC8'} size="lg" />
                        <div className="min-w-[12rem] flex-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h2 className="text-xl font-semibold tracking-tight">{client.name}</h2>
                                {portal.has_password ? (
                                    <Badge variant="success" className="gap-1">
                                        <ShieldCheck className="h-3 w-3" />
                                        {t('Portail actif')}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline">{t('Sans accès portail')}</Badge>
                                )}
                                {client.loyalty_points > 0 && (
                                    <Badge variant="accent">{client.loyalty_points} {t('points')}</Badge>
                                )}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                {client.phone && (
                                    <span className="flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        {client.phone}
                                    </span>
                                )}
                                {client.email && (
                                    <span className="flex items-center gap-1">
                                        <Mail className="h-3 w-3" />
                                        {client.email}
                                    </span>
                                )}
                                {client.birth_date && (
                                    <span className="flex items-center gap-1">
                                        <Cake className="h-3 w-3" />
                                        {formatDate(client.birth_date)}
                                    </span>
                                )}
                                {client.gender && <span>{t(GENDER_LABELS[client.gender])}</span>}
                                <span>{t('Client depuis {date}', { date: client.created_at ? formatDate(client.created_at) : '—' })}</span>
                            </div>
                            {client.notes && (
                                <p className="mt-2 max-w-xl text-xs italic text-muted-foreground/80">{client.notes}</p>
                            )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
                                <Pencil />
                                {t('Modifier')}
                            </Button>
                            {(hasPermission('subscriptions.sell') || hasPermission('loyalty.redeem')) && (
                                <Button type="button" variant="accent" onClick={() => setSellOpen(true)}>
                                    <Plus />
                                    {t('Vendre un abonnement')}
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* ------------------------------------------------ stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <StatTile icon={ShoppingBag} label={t('Visites')} value={String(stats.sales_count)} />
                    <StatTile
                        icon={Wallet}
                        label={t('Total dépensé')}
                        value={formatCurrency(stats.total_spent, { maximumFractionDigits: 0 })}
                        accent
                    />
                    <StatTile icon={CalendarClock} label={t('Rendez-vous')} value={String(stats.appointments_count)} />
                    <StatTile icon={Gift} label={t('Points fidélité')} value={String(client.loyalty_points)} />
                    <StatTile icon={BadgeCheck} label={t('Abonnements actifs')} value={String(stats.active_subscriptions)} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    {/* ------------------------------------------------ portal access */}
                    <Card>
                        <CardContent className="p-5">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                <Smartphone className="h-3.5 w-3.5" />
                                {t('Compte portail « Mon BOGOSLAND »')}
                            </p>
                            <div className="mt-3 space-y-2 text-sm">
                                <PortalRow
                                    ok={portal.has_password}
                                    label={t(portal.has_password ? 'Accès configuré (téléphone + mot de passe)' : 'Aucun accès configuré')}
                                />
                                <PortalRow
                                    ok={portal.registered_at !== null}
                                    label={
                                        portal.registered_at
                                            ? t('Inscrit le {date}', { date: formatDate(portal.registered_at) })
                                            : t('Non inscrit au programme')
                                    }
                                />
                                <PortalRow
                                    ok={portal.marketing_consent}
                                    label={t(portal.marketing_consent ? 'Consentement marketing accordé' : 'Pas de consentement marketing')}
                                    neutral={!portal.marketing_consent}
                                />
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={portalPasswordMutation.isPending}
                                    onClick={() => portalPasswordMutation.mutate()}
                                >
                                    {portalPasswordMutation.isPending ? (
                                        <Loader2 className="animate-spin" />
                                    ) : (
                                        <KeyRound />
                                    )}
                                    {t(portal.has_password ? 'Réinitialiser le mot de passe' : "Créer l'accès portail")}
                                </Button>
                                {hasPermission('loyalty.redeem') && (
                                    <Button type="button" variant="outline" size="sm" onClick={() => setQrOpen(true)}>
                                        <QrCodeIcon />
                                        {t('QR fidélité')}
                                    </Button>
                                )}
                            </div>
                            {portalPasswordMutation.isError && (
                                <p className="mt-3 text-xs text-destructive">
                                    {getErrorMessage(portalPasswordMutation.error)}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* ------------------------------------------------ loyalty */}
                    <Card>
                        <CardContent className="p-5">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                <Gift className="h-3.5 w-3.5" />
                                {t('Fidélité')}
                            </p>
                            {!loyalty ? (
                                <p className="mt-3 text-xs text-muted-foreground">{t('Chargement…')}</p>
                            ) : (
                                <div className="mt-3 space-y-3">
                                    <div className="flex items-center justify-between rounded-md border border-accent/20 bg-accent/[0.06] px-3.5 py-2.5">
                                        <span className="text-sm">{t('Solde de points')}</span>
                                        <span className="text-lg font-bold tabular-nums text-accent">
                                            {loyalty.points_balance}
                                        </span>
                                    </div>
                                    {loyalty.rewards.length > 0 ? (
                                        <div>
                                            <p className="text-xs font-medium text-foreground">
                                                {loyalty.rewards.length}{' '}
                                                {t(loyalty.rewards.length > 1 ? 'récompenses disponibles' : 'récompense disponible')}
                                            </p>
                                            <div className="mt-1.5 space-y-1.5">
                                                {loyalty.rewards.slice(0, 4).map((reward) => (
                                                    <div
                                                        key={reward.id}
                                                        className="flex items-center justify-between gap-3 rounded-md bg-tint/[0.03] px-3 py-2 text-xs"
                                                    >
                                                        <span className="truncate">
                                                            {reward.service_name ?? reward.program_name ?? t('Récompense')}
                                                        </span>
                                                        {reward.expires_at && (
                                                            <span className="shrink-0 text-muted-foreground">
                                                                {t('exp.')} {formatDate(reward.expires_at)}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">{t('Aucune récompense disponible.')}</p>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ------------------------------------------------ subscriptions */}
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                <BadgeCheck className="h-3.5 w-3.5" />
                                {t('Abonnements')}
                            </p>
                            {subscriptions.length > 0 && (
                                <Link
                                    to="/abonnements"
                                    className="flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
                                >
                                    {t('Gérer')}
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                            )}
                        </div>
                        {subscriptions.length === 0 ? (
                            <p className="mt-3 text-xs text-muted-foreground">
                                {t('Aucun abonnement — vendez-en un depuis le bouton en haut de la fiche.')}
                            </p>
                        ) : (
                            <div className="mt-3 space-y-2">
                                {subscriptions.map((subscription) => {
                                    const status = SUBSCRIPTION_STATUS[subscription.status] ?? SUBSCRIPTION_STATUS.active;
                                    return (
                                        <div
                                            key={subscription.id}
                                            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-tint/[0.08] bg-tint/[0.02] px-4 py-2.5"
                                        >
                                            <span className="min-w-[9rem] flex-1 truncate text-sm font-medium">
                                                {subscription.plan.name}
                                            </span>
                                            <span className="text-xs tabular-nums text-muted-foreground">
                                                {formatDate(subscription.starts_on)} → {formatDate(subscription.ends_on)}
                                            </span>
                                            <span className="text-sm font-semibold tabular-nums text-accent">
                                                {subscription.total_visits !== null
                                                    ? `${subscription.used_visits}/${subscription.total_visits}`
                                                    : `${subscription.used_visits} ${t('visites')}`}
                                            </span>
                                            <Badge variant={status.variant} className="shrink-0">
                                                {t(status.label)}
                                            </Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ------------------------------------------------ history */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardContent className="p-5">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                <History className="h-3.5 w-3.5" />
                                {t('Dernières ventes')}
                            </p>
                            {recent_sales.length === 0 ? (
                                <p className="mt-3 text-xs text-muted-foreground">{t('Aucune vente enregistrée.')}</p>
                            ) : (
                                <div className="mt-3 space-y-1.5">
                                    {recent_sales.map((sale) => (
                                        <div
                                            key={sale.id}
                                            className="flex items-center justify-between gap-3 rounded-md bg-tint/[0.03] px-3.5 py-2"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm">{sale.label}</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {sale.date ? `${formatDate(sale.date)} · ${formatTime(sale.date)}` : '—'}
                                                    {sale.payment_method ? ` · ${sale.payment_method}` : ''}
                                                </p>
                                            </div>
                                            <span
                                                className={cn(
                                                    'shrink-0 text-sm font-semibold tabular-nums',
                                                    sale.total > 0 ? 'text-accent' : 'text-muted-foreground',
                                                )}
                                            >
                                                {formatCurrency(sale.total, { maximumFractionDigits: 0 })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-5">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                <CalendarClock className="h-3.5 w-3.5" />
                                {t('Derniers rendez-vous')}
                            </p>
                            {recent_appointments.length === 0 ? (
                                <p className="mt-3 text-xs text-muted-foreground">{t('Aucun rendez-vous.')}</p>
                            ) : (
                                <div className="mt-3 space-y-1.5">
                                    {recent_appointments.map((appointment) => {
                                        const status =
                                            APPOINTMENT_STATUS[appointment.status] ?? APPOINTMENT_STATUS.pending;
                                        return (
                                            <div
                                                key={appointment.id}
                                                className="flex items-center justify-between gap-3 rounded-md bg-tint/[0.03] px-3.5 py-2"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm">
                                                        {appointment.service_name ?? t('Réservation')}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {appointment.starts_at
                                                            ? `${formatDate(appointment.starts_at)} · ${formatTime(appointment.starts_at)}`
                                                            : '—'}
                                                    </p>
                                                </div>
                                                <Badge variant={status.variant} className="shrink-0">
                                                    {t(status.label)}
                                                </Badge>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </motion.div>

            <EditClientDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                overview={overviewQuery.data}
                onSaved={() => {
                    void queryClient.invalidateQueries({ queryKey: ['clients'] });
                    setEditOpen(false);
                }}
            />

            <SellToClientDialog
                open={sellOpen}
                onOpenChange={setSellOpen}
                clientId={clientId}
                clientName={client.name}
                onSold={() => {
                    void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
                    void queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'overview'] });
                    setSellOpen(false);
                }}
            />

            <PersonalQrDialog open={qrOpen} onOpenChange={setQrOpen} clientId={clientId} clientName={client.name} />

            {/* Portal credentials — shown exactly once */}
            <Dialog open={credentials !== null} onOpenChange={(open) => { if (!open) setCredentials(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('Accès portail créé')}</DialogTitle>
                        <DialogDescription>
                            {t('Communiquez ces identifiants à {name} — le mot de passe ne sera plus affiché ensuite. Connexion sur la page « Mon BOGOSLAND ».', { name: client.name })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <CredentialRow label={t('Téléphone (identifiant)')} value={credentials?.phone ?? ''} />
                        <CredentialRow label={t('Mot de passe')} value={credentials?.password ?? ''} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="accent" onClick={() => setCredentials(null)}>
                            {t('Terminé')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/* ------------------------------------------------------------------ */

function StatTile({
    icon: Icon,
    label,
    value,
    accent = false,
}: {
    icon: typeof Wallet;
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <Card>
            <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                </p>
                <p className={cn('mt-1.5 text-xl font-bold tabular-nums', accent ? 'text-accent' : 'text-foreground')}>
                    {value}
                </p>
            </CardContent>
        </Card>
    );
}

function PortalRow({ ok, label, neutral = false }: { ok: boolean; label: string; neutral?: boolean }) {
    return (
        <p className="flex items-center gap-2 text-xs">
            {ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
                <XCircle className={cn('h-3.5 w-3.5 shrink-0', neutral ? 'text-muted-foreground/50' : 'text-destructive/70')} />
            )}
            <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
        </p>
    );
}

/* ------------------------------------------------------------------ */
/* Edit dialog — full identity incl. birth date & gender               */
/* ------------------------------------------------------------------ */

function EditClientDialog({
    open,
    onOpenChange,
    overview,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    overview: ClientOverview;
    onSaved: () => void;
}) {
    const { t } = useI18n();
    const [form, setForm] = useState({ name: '', phone: '', email: '', birth_date: '', gender: '', notes: '' });

    useEffect(() => {
        if (open) {
            setForm({
                name: overview.client.name,
                phone: overview.client.phone ?? '',
                email: overview.client.email ?? '',
                birth_date: overview.client.birth_date ?? '',
                gender: overview.client.gender ?? '',
                notes: overview.client.notes ?? '',
            });
        }
    }, [open, overview]);

    const mutation = useMutation({
        mutationFn: () => {
            const payload: ClientPayload = {
                name: form.name.trim(),
                phone: form.phone.trim() || null,
                email: form.email.trim() || null,
                birth_date: form.birth_date || null,
                gender: (form.gender || null) as ClientPayload['gender'],
                notes: form.notes.trim() || null,
            };
            return updateClient(overview.client.id, payload);
        },
        onSuccess: onSaved,
    });

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (form.name.trim()) mutation.mutate();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('Modifier la fiche client')}</DialogTitle>
                    <DialogDescription>{t("Identité et coordonnées utilisées partout dans l'application.")}</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="cd-name">{t('Nom complet')}</Label>
                        <Input id="cd-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="cd-phone">{t('Téléphone')}</Label>
                            <Input id="cd-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cd-email">{t('Email')}</Label>
                            <Input id="cd-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cd-birth">{t('Date de naissance')}</Label>
                            <Input id="cd-birth" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cd-gender">{t('Sexe')}</Label>
                            <select
                                id="cd-gender"
                                value={form.gender}
                                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                                className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                            >
                                <option value="">{t('Non renseigné')}</option>
                                <option value="female">{t('Femme')}</option>
                                <option value="male">{t('Homme')}</option>
                                <option value="other">{t('Autre')}</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="cd-notes">{t('Notes')}</Label>
                        <textarea
                            id="cd-notes"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            className="min-h-20 w-full rounded-md border border-input bg-tint/[0.03] px-3.5 py-2 text-sm text-foreground outline-none focus:border-accent/60"
                        />
                    </div>
                    {mutation.isError && <p className="text-sm text-destructive">{getErrorMessage(mutation.error)}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('Annuler')}
                        </Button>
                        <Button type="submit" variant="accent" disabled={mutation.isPending}>
                            {mutation.isPending && <Loader2 className="animate-spin" />}
                            {t('Enregistrer')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Quick subscription sale — client already known                      */
/* ------------------------------------------------------------------ */

function SellToClientDialog({
    open,
    onOpenChange,
    clientId,
    clientName,
    onSold,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clientId: number;
    clientName: string;
    onSold: () => void;
}) {
    const { t } = useI18n();
    const [planId, setPlanId] = useState<number | ''>('');
    const [paymentMethod, setPaymentMethod] = useState('especes');

    const { data: plans } = useQuery({
        queryKey: ['subscription-plans'],
        queryFn: getSubscriptionPlans,
        enabled: open,
    });

    useEffect(() => {
        if (!open) {
            setPlanId('');
            setPaymentMethod('especes');
        }
    }, [open]);

    const mutation = useMutation({
        mutationFn: () => purchaseSubscription(clientId, { subscription_plan_id: planId as number, payment_method: paymentMethod }),
        onSuccess: onSold,
    });

    const activePlans = (plans ?? []).filter((plan) => plan.is_active);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('Vendre un abonnement')}</DialogTitle>
                    <DialogDescription>
                        {t("Pour {name} — le QR personnel est généré à l'activation.", { name: clientName })}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
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
                                        {t(plan.duration_unit === 'days' ? 'jours' : plan.duration_unit === 'weeks' ? 'semaines' : 'mois')}
                                    </span>
                                </span>
                                <span className="shrink-0 text-sm font-semibold text-accent">
                                    {formatCurrency(plan.price, { maximumFractionDigits: 0 })}
                                </span>
                            </button>
                        ))}
                    </div>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('Paiement')}</span>
                        <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="mt-2 flex h-11 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm"
                        >
                            <option value="especes">{t('Espèces')}</option>
                            <option value="carte">{t('Carte')}</option>
                            <option value="virement">{t('Virement')}</option>
                            <option value="autre">{t('Autre')}</option>
                        </select>
                    </label>
                    {mutation.isError && (
                        <p className="text-sm text-destructive">{getErrorMessage(mutation.error)}</p>
                    )}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Annuler')}
                    </Button>
                    <Button type="button" variant="accent" disabled={planId === '' || mutation.isPending} onClick={() => mutation.mutate()}>
                        {mutation.isPending && <Loader2 className="animate-spin" />}
                        {t("Activer l'abonnement")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Personal loyalty QR                                                 */
/* ------------------------------------------------------------------ */

function PersonalQrDialog({
    open,
    onOpenChange,
    clientId,
    clientName,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clientId: number;
    clientName: string;
}) {
    const queryClient = useQueryClient();
    const { t } = useI18n();
    const [dataUrl, setDataUrl] = useState<string | null>(null);

    const { data } = useQuery({
        queryKey: ['clients', clientId, 'qr'],
        queryFn: () => getClientPersonalQr(clientId),
        enabled: open,
    });

    const regenerateMutation = useMutation({
        mutationFn: () => regenerateClientPersonalQr(clientId),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'qr'] }),
    });

    useEffect(() => {
        if (data?.token) {
            void QRCode.toDataURL(data.token, { width: 440, margin: 2 }).then(setDataUrl);
        } else {
            setDataUrl(null);
        }
    }, [data?.token]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{t('QR fidélité personnel')}</DialogTitle>
                    <DialogDescription>
                        {t('{name} — identifie le client à la caisse sans donner son téléphone.', { name: clientName })}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-3 py-2">
                    {data && !data.token ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            {t('Aucun QR actif — générez-en un ci-dessous.')}
                        </p>
                    ) : dataUrl ? (
                        <img src={dataUrl} alt={t('QR fidélité')} className="h-56 w-56 rounded-md bg-white p-3" />
                    ) : (
                        <Skeleton className="h-56 w-56 rounded-md" />
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={regenerateMutation.isPending}
                        onClick={() => regenerateMutation.mutate()}
                    >
                        {regenerateMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        {t(data?.token ? 'Régénérer' : 'Générer')}
                    </Button>
                </div>
                <DialogFooter>
                    <Button type="button" variant="accent" onClick={() => onOpenChange(false)}>
                        {t('Fermer')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
