import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Download } from 'lucide-react';
import { getErrorMessage, getMyReport, myReportExportUrl } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type QuickRange = 'day' | 'week' | 'month' | 'all';

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function toISODate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function rangeFor(quick: QuickRange): { from?: string; to?: string } {
    const now = new Date();
    if (quick === 'day') return { from: toISODate(now), to: toISODate(now) };
    if (quick === 'week') {
        const start = new Date(now);
        const day = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - day);
        return { from: toISODate(start), to: toISODate(now) };
    }
    if (quick === 'all') return { from: '2020-01-01', to: toISODate(now) };
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISODate(start), to: toISODate(now) };
}

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
    paid: 'success',
    cancelled: 'outline',
    refunded: 'destructive',
    pending_payment: 'accent',
};

export function MyReportPanel() {
    const [quick, setQuick] = useState<QuickRange>('month');
    const range = useMemo(() => rangeFor(quick), [quick]);

    const { data: report, isPending, isError, error } = useQuery({
        queryKey: ['me', 'report', range.from, range.to],
        queryFn: () => getMyReport(range),
    });

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    {(['day', 'week', 'month', 'all'] as QuickRange[]).map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => setQuick(option)}
                            className={cn(
                                'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200',
                                quick === option
                                    ? 'border-accent/60 bg-accent/[0.12] text-foreground'
                                    : 'border-tint/[0.08] text-muted-foreground hover:border-accent/30',
                            )}
                        >
                            {option === 'day'
                                ? "Aujourd'hui"
                                : option === 'week'
                                  ? 'Cette semaine'
                                  : option === 'month'
                                    ? 'Ce mois'
                                    : 'Tout'}
                        </button>
                    ))}
                </div>
                <Button variant="outline" size="sm" asChild>
                    <a href={myReportExportUrl(range)} download>
                        <Download className="h-3.5 w-3.5" />
                        Exporter (CSV)
                    </a>
                </Button>
            </div>

            {isPending ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 rounded-md" />
                    ))}
                </div>
            ) : isError ? (
                <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                </Card>
            ) : report ? (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Kpi label="Chiffre d'affaires" value={formatCurrency(report.revenue_total)} />
                        <Kpi label="Commissions" value={formatCurrency(report.commission_total)} accent />
                        <Kpi label="Prestations payées" value={String(report.paid_count)} />
                        <Kpi label="Ticket moyen" value={formatCurrency(report.average_ticket)} />
                        <Kpi label="Clients servis" value={String(report.clients_count)} />
                        <Kpi label="Annulées / remboursées" value={String(report.cancelled_count)} />
                    </div>

                    {report.top_services.length > 0 && (
                        <Card className="space-y-3 p-5">
                            <p className="text-sm font-semibold text-foreground">Top services</p>
                            <div className="space-y-1.5">
                                {report.top_services.map((service) => (
                                    <div key={service.label} className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            {service.label} <span className="text-xs">×{service.count}</span>
                                        </span>
                                        <span className="font-medium tabular-nums">{formatCurrency(service.total)}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    <Card className="space-y-2 p-5">
                        <p className="text-sm font-semibold text-foreground">Détail des prestations</p>
                        <div className="space-y-1.5">
                            {report.details.map((row) => (
                                <div
                                    key={row.reference}
                                    className={cn(
                                        'flex flex-wrap items-center justify-between gap-2 border-b border-tint/[0.05] py-2 text-sm last:border-0',
                                        row.is_deleted && 'opacity-70',
                                    )}
                                >
                                    <div className="min-w-0">
                                        <span
                                            className={cn(
                                                'font-medium text-foreground',
                                                row.is_deleted && 'text-muted-foreground',
                                            )}
                                        >
                                            {row.reference}
                                        </span>{' '}
                                        <span className="text-xs text-muted-foreground">
                                            {formatDate(row.date)} · {row.client}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <span
                                            className={cn(
                                                'tabular-nums',
                                                row.is_deleted && 'text-muted-foreground line-through decoration-destructive/70',
                                            )}
                                        >
                                            {formatCurrency(row.total)}
                                        </span>
                                        {!row.is_deleted && (
                                            <span className="text-xs tabular-nums text-accent">
                                                +{formatCurrency(row.commission)}
                                            </span>
                                        )}
                                        {row.is_deleted ? (
                                            <Badge variant="destructive">Supprimé</Badge>
                                        ) : (
                                            <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{row.status}</Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            ) : null}
        </div>
    );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <Card className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', accent && 'text-accent')}>{value}</p>
        </Card>
    );
}
