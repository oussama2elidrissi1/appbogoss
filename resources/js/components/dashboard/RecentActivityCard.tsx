import { CalendarClock, Inbox, Receipt, UserPlus } from 'lucide-react';
import type { ActivityItem, ActivityType } from '@/types/dashboard';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatRelativeTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from './EmptyState';

const typeConfig: Record<
    ActivityType,
    { icon: typeof Receipt; ring: string; text: string; bg: string }
> = {
    sale: {
        icon: Receipt,
        ring: 'ring-success/20',
        text: 'text-success',
        bg: 'bg-success/[0.12]',
    },
    appointment: {
        icon: CalendarClock,
        ring: 'ring-accent/20',
        text: 'text-accent',
        bg: 'bg-accent/[0.12]',
    },
    client: {
        icon: UserPlus,
        ring: 'ring-tint/10',
        text: 'text-muted-foreground',
        bg: 'bg-tint/[0.06]',
    },
};

export function RecentActivityCard({ items }: { items: ActivityItem[] }) {
    const { t } = useI18n();
    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>{t('Activité récente')}</CardTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Les derniers mouvements du salon')}
                </p>
            </CardHeader>

            <CardContent>
                {items.length === 0 ? (
                    <EmptyState
                        icon={Inbox}
                        title={t('Rien à signaler')}
                        description={t('L’activité du salon s’affichera ici au fil de la journée.')}
                    />
                ) : (
                    <ol className="relative space-y-5">
                        {items.map((item, index) => {
                            const config = typeConfig[item.type] ?? typeConfig.client;
                            const Icon = config.icon;
                            const isLast = index === items.length - 1;

                            return (
                                <li key={item.id} className="relative flex gap-3.5">
                                    {/* Timeline rail */}
                                    {!isLast && (
                                        <span
                                            aria-hidden
                                            className="absolute left-[17px] top-9 h-[calc(100%+4px)] w-px bg-tint/[0.07]"
                                        />
                                    )}

                                    <span
                                        className={cn(
                                            'relative z-10 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ring-1',
                                            config.bg,
                                            config.ring,
                                        )}
                                    >
                                        <Icon className={cn('h-4 w-4', config.text)} />
                                    </span>

                                    <div className="min-w-0 flex-1 pt-1">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {item.label}
                                            </p>
                                            {item.amount !== null && (
                                                <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                                                    {formatCurrency(item.amount)}
                                                </p>
                                            )}
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {item.description}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground/70">
                                            {formatRelativeTime(item.created_at)}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </CardContent>
        </Card>
    );
}
