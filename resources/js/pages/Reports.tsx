import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BarChart3, Download } from 'lucide-react';
import { getErrorMessage, getWorkDayPdfUrl, getWorkDays } from '@/lib/api';
import { formatCurrency, formatDayLabel } from '@/lib/utils';
import type { ClosingReport, WorkDay } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { getCategoryLabel } from '@/components/workday/categories';

function reportFor(day: WorkDay): ClosingReport | null {
    return day.report_snapshot ?? day.closing_report;
}

function dayRevenue(day: WorkDay): number {
    return reportFor(day)?.revenue_total ?? 0;
}

function dayNet(day: WorkDay): number {
    return reportFor(day)?.net_result ?? 0;
}

function ReportStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
        </div>
    );
}

function WorkDayReportCard({ day }: { day: WorkDay }) {
    const report = reportFor(day);
    const statusLabel = day.status === 'open' ? 'Ouverte' : 'Clôturée';
    const statusVariant = day.status === 'open' ? 'success' : 'outline';

    return (
        <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>Journée du {formatDayLabel(day.date)}</CardTitle>
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {day.employees.length} employé{day.employees.length > 1 ? 's' : ''} en
                        service · fond de caisse{' '}
                        {formatCurrency(day.opening_balance, { maximumFractionDigits: 2 })}
                    </p>
                </div>

                {day.status === 'closed' && (
                    <Button asChild variant="outline" size="sm">
                        <a href={getWorkDayPdfUrl(day.id)} target="_blank" rel="noreferrer">
                            <Download />
                            PDF
                        </a>
                    </Button>
                )}
            </CardHeader>

            <CardContent className="space-y-4">
                {report ? (
                    <>
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                            <ReportStat
                                label="CA"
                                value={formatCurrency(report.revenue_total, {
                                    maximumFractionDigits: 2,
                                })}
                            />
                            <ReportStat
                                label="Dépenses"
                                value={formatCurrency(report.expenses_total, {
                                    maximumFractionDigits: 2,
                                })}
                            />
                            <ReportStat
                                label="Avances"
                                value={formatCurrency(report.advances_total, {
                                    maximumFractionDigits: 2,
                                })}
                            />
                            <ReportStat
                                label="Commissions"
                                value={formatCurrency(report.commissions_total, {
                                    maximumFractionDigits: 2,
                                })}
                            />
                            <ReportStat
                                label="Résultat"
                                value={formatCurrency(report.net_result, {
                                    maximumFractionDigits: 2,
                                })}
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                            <section className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    Par catégorie
                                </h3>
                                <div className="space-y-2">
                                    {report.revenue_by_category.map((row) => (
                                        <div
                                            key={row.category}
                                            className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                                        >
                                            <span className="truncate text-sm">
                                                {getCategoryLabel(row.category)}
                                            </span>
                                            <span className="text-sm font-semibold tabular-nums text-accent">
                                                {formatCurrency(row.total, {
                                                    maximumFractionDigits: 2,
                                                })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    Par employé
                                </h3>
                                <div className="space-y-2">
                                    {report.revenue_by_employee.map((row) => (
                                        <div
                                            key={row.employee_id}
                                            className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm">
                                                    {row.employee_name}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {row.count} ticket{row.count > 1 ? 's' : ''}
                                                </span>
                                            </span>
                                            <span className="text-sm font-semibold tabular-nums text-accent">
                                                {formatCurrency(row.total, {
                                                    maximumFractionDigits: 2,
                                                })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    Top prestations
                                </h3>
                                <div className="space-y-2">
                                    {report.top_prestations.map((row) => (
                                        <div
                                            key={row.label}
                                            className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm">{row.label}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {row.count} passage{row.count > 1 ? 's' : ''}
                                                </span>
                                            </span>
                                            <span className="text-sm font-semibold tabular-nums text-accent">
                                                {formatCurrency(row.total, {
                                                    maximumFractionDigits: 2,
                                                })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    </>
                ) : (
                    <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-5 text-sm text-muted-foreground">
                        Les totaux seront disponibles dès les premiers encaissements. Le PDF sera
                        disponible après clôture.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function Reports() {
    const { data: workDays, isPending, isError, error, refetch } = useQuery({
        queryKey: ['work-days', 'reports'],
        queryFn: getWorkDays,
        refetchInterval: 15_000,
    });

    const totals = useMemo(() => {
        const days = workDays ?? [];

        return {
            days: days.length,
            closedDays: days.filter((day) => day.status === 'closed').length,
            revenue: days.reduce((sum, day) => sum + dayRevenue(day), 0),
            net: days.reduce((sum, day) => sum + dayNet(day), 0),
        };
    }, [workDays]);

    if (isPending) {
        return (
            <div className="space-y-6">
                <div>
                    <Skeleton className="h-7 w-40" />
                    <Skeleton className="mt-3 h-4 w-72" />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-24 rounded-md" />
                    ))}
                </div>
                <Skeleton className="h-80 rounded-md" />
            </div>
        );
    }

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                </span>
                <h2 className="mt-4 text-base font-semibold">Impossible de charger les rapports</h2>
                <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                    {getErrorMessage(error)}
                </p>
                <Button variant="accent" className="mt-6" onClick={() => void refetch()}>
                    Réessayer
                </Button>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">Rapports</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Historique des journées de caisse, totaux et rapports de clôture.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <ReportStat label="Journées" value={String(totals.days)} />
                <ReportStat label="Clôturées" value={String(totals.closedDays)} />
                <ReportStat
                    label="CA historique"
                    value={formatCurrency(totals.revenue, { maximumFractionDigits: 2 })}
                />
                <ReportStat
                    label="Résultat historique"
                    value={formatCurrency(totals.net, { maximumFractionDigits: 2 })}
                />
            </div>

            {(workDays ?? []).length === 0 ? (
                <EmptyState
                    icon={BarChart3}
                    title="Aucune journée de caisse"
                    description="Les rapports apparaîtront ici après ouverture puis clôture de vos journées."
                />
            ) : (
                <div className="space-y-4">
                    {(workDays ?? []).map((day) => (
                        <WorkDayReportCard key={day.id} day={day} />
                    ))}
                </div>
            )}
        </div>
    );
}
