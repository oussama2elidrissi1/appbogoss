import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { AlertCircle, CalendarClock, CheckCircle2, Clock, History, QrCode as QrCodeIcon } from 'lucide-react';
import { getErrorMessage, getPortalSubscriptions } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PortalSubscription } from '@/types/portal';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const } },
};

const STATUS_LABELS: Record<PortalSubscription['status'], string> = {
    active: 'Actif',
    expired: 'Expiré',
    cancelled: 'Annulé',
    suspended: 'Suspendu',
};

function statusVariant(status: PortalSubscription['status']): 'accent' | 'outline' | 'destructive' {
    if (status === 'active') return 'accent';
    if (status === 'suspended') return 'outline';
    return 'outline';
}

const DAY_SHORT = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Personal scan QR — encodes only the random token, never an id. */
function SubscriptionQr({ token }: { token: string }) {
    const { t } = useI18n();
    const [dataUrl, setDataUrl] = useState<string | null>(null);

    useEffect(() => {
        void QRCode.toDataURL(token, { width: 440, margin: 2 }).then(setDataUrl);
    }, [token]);

    return (
        <div className="mt-4 flex flex-col items-center rounded-md border border-accent/20 bg-accent/[0.04] px-4 py-5">
            {dataUrl ? (
                <img src={dataUrl} alt={t('QR de mon abonnement')} className="h-52 w-52 rounded-md bg-white p-2.5" />
            ) : (
                <Skeleton className="h-52 w-52 rounded-md" />
            )}
            <p className="mt-3 flex items-center gap-1.5 text-center text-xs text-muted-foreground">
                <QrCodeIcon className="h-3.5 w-3.5 text-accent" />
                {t('Présentez ce QR à la caisse lors de votre visite.')}
            </p>
        </div>
    );
}

function SubscriptionCard({ subscription }: { subscription: PortalSubscription }) {
    const { t } = useI18n();
    const hasRules =
        (subscription.allowed_days?.length ?? 0) > 0 ||
        Boolean(subscription.time_start && subscription.time_end) ||
        subscription.max_per_day != null ||
        subscription.max_per_week != null ||
        subscription.min_interval_minutes != null;

    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">{subscription.plan_name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {subscription.starts_on && new Date(subscription.starts_on).toLocaleDateString('fr-FR')} →{' '}
                        {subscription.ends_on && new Date(subscription.ends_on).toLocaleDateString('fr-FR')}
                    </p>
                </div>
                <Badge variant={statusVariant(subscription.status)}>{t(STATUS_LABELS[subscription.status])}</Badge>
            </div>

            {subscription.status === 'suspended' && subscription.suspension_ends_on && (
                <p className="mt-2 text-xs text-muted-foreground">
                    {t('Suspendu jusqu’au {date}', { date: new Date(subscription.suspension_ends_on).toLocaleDateString('fr-FR') })}
                </p>
            )}

            {subscription.services.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-tint/[0.06] pt-3">
                    {subscription.services.map((service, index) => {
                        const remaining =
                            service.period_remaining !== null
                                ? service.period_remaining
                                : service.total_remaining !== null
                                  ? service.total_remaining
                                  : null;
                        const quota = service.quota_per_period ?? service.quota_total;

                        return (
                            <div key={index}>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-foreground">{service.service_name}</span>
                                    <span className="text-muted-foreground">
                                        {remaining !== null && quota !== null
                                            ? `${remaining} / ${quota}`
                                            : remaining !== null
                                              ? t('{n} restant(s)', { n: remaining })
                                              : t('illimité')}
                                    </span>
                                </div>
                                {remaining !== null && quota !== null && quota > 0 && (
                                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tint/[0.08]">
                                        <div
                                            className="h-1.5 rounded-full bg-accent transition-all"
                                            style={{ width: `${Math.min(100, (remaining / quota) * 100)}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Usage rules recap */}
            {hasRules && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-tint/[0.06] pt-3">
                    {(subscription.allowed_days?.length ?? 0) > 0 && (
                        <span className="rounded-full border border-tint/[0.08] bg-tint/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">
                            {subscription.allowed_days!.map((day) => t(DAY_SHORT[day])).join(' · ')}
                        </span>
                    )}
                    {subscription.time_start && subscription.time_end && (
                        <span className="rounded-full border border-tint/[0.08] bg-tint/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">
                            {subscription.time_start} → {subscription.time_end}
                        </span>
                    )}
                    {subscription.max_per_day != null && (
                        <span className="rounded-full border border-tint/[0.08] bg-tint/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">
                            {t('{n}/jour max', { n: subscription.max_per_day })}
                        </span>
                    )}
                    {subscription.max_per_week != null && (
                        <span className="rounded-full border border-tint/[0.08] bg-tint/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">
                            {t('{n}/semaine max', { n: subscription.max_per_week })}
                        </span>
                    )}
                    {subscription.min_interval_minutes != null && (
                        <span className="rounded-full border border-tint/[0.08] bg-tint/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">
                            {t('1 visite / {x}', { x: subscription.min_interval_minutes % 60 === 0 ? t('{n}h', { n: subscription.min_interval_minutes / 60 }) : t('{n} min', { n: subscription.min_interval_minutes }) })}
                        </span>
                    )}
                </div>
            )}

            {/* Personal QR — only while active */}
            {subscription.status === 'active' && subscription.qr_token && (
                <SubscriptionQr token={subscription.qr_token} />
            )}

            {/* Visit history */}
            {(subscription.recent_usages?.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-tint/[0.06] pt-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                        <History className="h-3.5 w-3.5" />
                        {t('Historique')}
                    </p>
                    <div className="mt-2 space-y-1.5">
                        {subscription.recent_usages!.map((usage, index) => (
                            <div
                                key={index}
                                className="flex items-center justify-between gap-3 rounded-md bg-tint/[0.03] px-3 py-2"
                            >
                                <span className="flex min-w-0 items-center gap-2 text-xs">
                                    <Clock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                                    <span className="truncate">{usage.service_name}</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                    <span className="text-[11px] tabular-nums text-muted-foreground">
                                        {usage.used_at
                                            ? new Date(usage.used_at).toLocaleDateString('fr-FR', {
                                                  day: 'numeric',
                                                  month: 'short',
                                              })
                                            : '—'}
                                    </span>
                                    <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                                        <CheckCircle2 className="h-3 w-3" />
                                        {t('Validé')}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
}

export default function PortalSubscriptions() {
    const { t } = useI18n();
    const subscriptionsQuery = useQuery({ queryKey: ['portal', 'subscriptions'], queryFn: getPortalSubscriptions });

    if (subscriptionsQuery.isPending) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
            </div>
        );
    }

    if (subscriptionsQuery.isError) {
        return (
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-4 py-3">
                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{getErrorMessage(subscriptionsQuery.error)}</p>
            </div>
        );
    }

    const subscriptions = subscriptionsQuery.data;

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            <motion.div variants={item}>
                <h1 className="text-xl font-semibold tracking-tight">{t('Mes abonnements')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('Suivez vos quotas restants par service.')}</p>
            </motion.div>

            {subscriptions.length === 0 ? (
                <motion.div variants={item} className="rounded-md border border-tint/[0.06] bg-tint/[0.02] p-6 text-center">
                    <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm text-muted-foreground">{t('Aucun abonnement pour le moment.')}</p>
                </motion.div>
            ) : (
                <motion.div variants={item} className="space-y-3">
                    {subscriptions.map((subscription) => (
                        <SubscriptionCard key={subscription.id} subscription={subscription} />
                    ))}
                </motion.div>
            )}
        </motion.div>
    );
}
