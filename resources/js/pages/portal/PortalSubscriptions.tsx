import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, CalendarClock } from 'lucide-react';
import { getErrorMessage, getPortalSubscriptions } from '@/lib/api';
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

function SubscriptionCard({ subscription }: { subscription: PortalSubscription }) {
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
                <Badge variant={statusVariant(subscription.status)}>{STATUS_LABELS[subscription.status]}</Badge>
            </div>

            {subscription.status === 'suspended' && subscription.suspension_ends_on && (
                <p className="mt-2 text-xs text-muted-foreground">
                    Suspendu jusqu’au {new Date(subscription.suspension_ends_on).toLocaleDateString('fr-FR')}
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
                                              ? `${remaining} restant(s)`
                                              : 'illimité'}
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
        </Card>
    );
}

export default function PortalSubscriptions() {
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
                <h1 className="text-xl font-semibold tracking-tight">Mes abonnements</h1>
                <p className="mt-1 text-sm text-muted-foreground">Suivez vos quotas restants par service.</p>
            </motion.div>

            {subscriptions.length === 0 ? (
                <motion.div variants={item} className="rounded-md border border-tint/[0.06] bg-tint/[0.02] p-6 text-center">
                    <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm text-muted-foreground">Aucun abonnement pour le moment.</p>
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
