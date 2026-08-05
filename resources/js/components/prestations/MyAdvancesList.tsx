import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Check, HandCoins } from 'lucide-react';
import { getErrorMessage, getMyAdvances } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';

/** Read-only — an employee can see their own advances but never create, edit, settle or delete one; that stays admin/patron-only. */
export function MyAdvancesList() {
    const { data, isPending, isError, error } = useQuery({
        queryKey: ['me', 'advances'],
        queryFn: getMyAdvances,
    });

    const advances = data?.data ?? [];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <HandCoins className="h-4 w-4" />
                    Avances en cours
                </span>
                {isPending ? (
                    <Skeleton className="h-5 w-20" />
                ) : (
                    <span className="text-sm font-semibold tabular-nums text-accent">
                        {formatCurrency(data?.outstanding_total ?? 0, { maximumFractionDigits: 2 })}
                    </span>
                )}
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
            ) : advances.length === 0 ? (
                <EmptyState
                    icon={HandCoins}
                    title="Aucune avance"
                    description="Les avances sur salaire qui vous sont données apparaîtront ici."
                />
            ) : (
                <div className="space-y-2">
                    {advances.map((advance) => (
                        <Card
                            key={advance.id}
                            className={cn('flex flex-wrap items-center justify-between gap-3 p-4', advance.settled_at && 'opacity-70')}
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-semibold tabular-nums text-foreground">
                                    {formatCurrency(advance.amount, { maximumFractionDigits: 2 })}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {formatDate(advance.given_on)}
                                    {advance.work_day_date && advance.work_day_date !== advance.given_on
                                        ? ` · caisse du ${formatDate(advance.work_day_date)}`
                                        : ''}
                                    {advance.reason ? ` · ${advance.reason}` : ''}
                                </p>
                            </div>
                            {advance.settled_at ? (
                                <span
                                    className="inline-flex items-center gap-1 text-xs text-success"
                                    title={
                                        advance.commission_payout_period
                                            ? `Soldée automatiquement via la paie de ${advance.commission_payout_period}`
                                            : undefined
                                    }
                                >
                                    <Check className="h-3.5 w-3.5" />
                                    {advance.commission_payout_period
                                        ? `Réglée (paie ${advance.commission_payout_period})`
                                        : 'Réglée'}
                                </span>
                            ) : (
                                <span className="text-xs text-muted-foreground">Non réglée</span>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
