import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Bell, CalendarClock, Gift, Sparkles, TicketPercent } from 'lucide-react';
import { getErrorMessage, getPortalHome } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const } },
};

export default function PortalHome() {
    const homeQuery = useQuery({ queryKey: ['portal', 'home'], queryFn: getPortalHome });

    if (homeQuery.isPending) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-lg" />
            </div>
        );
    }

    if (homeQuery.isError) {
        return (
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-4 py-3">
                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{getErrorMessage(homeQuery.error)}</p>
            </div>
        );
    }

    const home = homeQuery.data;

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
            <motion.div variants={item}>
                <h1 className="text-xl font-semibold tracking-tight">Bonjour {home.name.split(' ')[0]} 👋</h1>
                <p className="mt-1 text-sm text-muted-foreground">Voici votre programme de fidélité BOGOSLAND.</p>
            </motion.div>

            {home.alerts.length > 0 && (
                <motion.div variants={item} className="space-y-2">
                    {home.alerts.map((alert, index) => (
                        <div
                            key={`${alert.type}-${index}`}
                            className="flex items-start gap-2.5 rounded-md border border-accent/25 bg-accent/[0.08] px-3.5 py-3"
                        >
                            <Bell className="mt-px h-4 w-4 shrink-0 text-accent" />
                            <p className="text-sm leading-relaxed text-foreground">{alert.message}</p>
                        </div>
                    ))}
                </motion.div>
            )}

            <motion.div variants={item} className="grid grid-cols-3 gap-3">
                <Stat icon={Sparkles} label="Points" value={home.points_balance} />
                <Stat icon={Gift} label="Récompenses" value={home.rewards_available} />
                <Stat icon={CalendarClock} label="Abonnements" value={home.active_subscriptions} />
            </motion.div>

            {home.next_reward && (
                <motion.div variants={item}>
                    <Card className="p-5">
                        <div className="flex items-center gap-2">
                            <TicketPercent className="h-4 w-4 text-accent" />
                            <h2 className="text-sm font-semibold text-foreground">{home.next_reward.name}</h2>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {home.next_reward.current} / {home.next_reward.threshold ?? '—'} — encore{' '}
                            {home.next_reward.remaining} pour votre prochaine récompense
                        </p>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-tint/[0.08]">
                            <div
                                className="h-2 rounded-full bg-accent transition-all"
                                style={{ width: `${home.next_reward.percent ?? 0}%` }}
                            />
                        </div>
                    </Card>
                </motion.div>
            )}

            {home.subscriptions.length > 0 && (
                <motion.div variants={item} className="space-y-3">
                    <h2 className="text-sm font-semibold text-foreground">Mes abonnements actifs</h2>
                    {home.subscriptions.map((subscription) => (
                        <Card key={subscription.id} className="p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-foreground">{subscription.plan_name}</span>
                                <span className="text-xs text-muted-foreground">
                                    jusqu’au {subscription.ends_on ? new Date(subscription.ends_on).toLocaleDateString('fr-FR') : '—'}
                                </span>
                            </div>
                            <div className="mt-2 space-y-1.5">
                                {subscription.services.map((service, index) => (
                                    <div key={index} className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{service.service_name}</span>
                                        <span>
                                            {service.period_remaining !== null
                                                ? `${service.period_remaining} restant(s) cette période`
                                                : service.total_remaining !== null
                                                  ? `${service.total_remaining} restant(s)`
                                                  : 'illimité'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    ))}
                </motion.div>
            )}
        </motion.div>
    );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Sparkles; label: string; value: number }) {
    return (
        <Card className="flex flex-col items-center gap-1.5 p-4 text-center">
            <Icon className="h-4 w-4 text-accent" />
            <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
            <span className="text-[11px] text-muted-foreground">{label}</span>
        </Card>
    );
}
