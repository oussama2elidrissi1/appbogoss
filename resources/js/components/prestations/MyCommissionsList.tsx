import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, HandCoins } from 'lucide-react';
import { getErrorMessage, getMyCommissions } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';

type QuickRange = 'today' | 'week' | 'month' | 'all';

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function toISODate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function rangeFor(quick: QuickRange): { from?: string; to?: string } {
    const now = new Date();
    if (quick === 'today') return { from: toISODate(now), to: toISODate(now) };
    if (quick === 'week') {
        const start = new Date(now);
        const day = (start.getDay() + 6) % 7; // Monday-first
        start.setDate(start.getDate() - day);
        return { from: toISODate(start), to: toISODate(now) };
    }
    if (quick === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: toISODate(start), to: toISODate(now) };
    }
    return {};
}

const QUICK_OPTIONS: Array<{ value: QuickRange; label: string }> = [
    { value: 'today', label: "Aujourd'hui" },
    { value: 'week', label: 'Cette semaine' },
    { value: 'month', label: 'Ce mois' },
    { value: 'all', label: 'Tout' },
];

export function MyCommissionsList() {
    const { t } = useI18n();
    const [quick, setQuick] = useState<QuickRange>('month');
    const range = useMemo(() => rangeFor(quick), [quick]);

    const { data: rows, isPending, isError, error } = useQuery({
        queryKey: ['me', 'commissions', range.from, range.to],
        queryFn: () => getMyCommissions(range),
    });

    const total =
        rows?.reduce((sum, row) => sum + (row.status === 'validated' && !row.is_deleted ? row.amount : 0), 0) ?? 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    {QUICK_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setQuick(option.value)}
                            className={cn(
                                'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200',
                                quick === option.value
                                    ? 'border-accent/60 bg-accent/[0.12] text-foreground'
                                    : 'border-tint/[0.08] text-muted-foreground hover:border-accent/30',
                            )}
                        >
                            {t(option.label)}
                        </button>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground">
                    {t('Total :')} <span className="font-semibold text-accent">{formatCurrency(total)}</span>
                </p>
            </div>

            {isPending ? (
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-14 w-full rounded-md" />
                    ))}
                </div>
            ) : isError ? (
                <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                </Card>
            ) : !rows || rows.length === 0 ? (
                <EmptyState
                    icon={HandCoins}
                    title={t('Aucune commission')}
                    description={t('Vos commissions générées à la confirmation des paiements apparaîtront ici.')}
                />
            ) : (
                <div className="space-y-2">
                    {rows.map((row) => (
                        <Card
                            key={row.id}
                            className={cn(
                                'flex flex-wrap items-center justify-between gap-3 p-4',
                                row.is_deleted && 'opacity-70',
                            )}
                        >
                            <div className="min-w-0">
                                <p
                                    className={cn(
                                        'truncate text-sm font-medium text-foreground',
                                        row.is_deleted && 'text-muted-foreground',
                                    )}
                                >
                                    {row.service_name ?? t('Service')} · {row.prestation_reference}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {formatDate(row.date)} · {row.type === 'percentage' ? `${row.rate_or_amount}%` : formatCurrency(row.rate_or_amount)}{' '}
                                    {t('sur')} {formatCurrency(row.base_amount)}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span
                                    className={cn(
                                        'text-sm font-semibold tabular-nums text-accent',
                                        row.is_deleted && 'text-muted-foreground line-through decoration-destructive/70',
                                    )}
                                >
                                    {formatCurrency(row.amount)}
                                </span>
                                {row.is_deleted ? (
                                    <Badge variant="destructive">{t('Supprimé')}</Badge>
                                ) : (
                                    <Badge variant={row.status === 'validated' ? 'success' : 'outline'}>
                                        {row.status === 'validated' ? t('Validée') : t('Annulée')}
                                    </Badge>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
