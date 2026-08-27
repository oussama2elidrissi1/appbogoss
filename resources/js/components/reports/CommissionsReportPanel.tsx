import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, HandCoins } from 'lucide-react';
import { getCommissionsReport, getEmployees, getErrorMessage } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { CommissionsReport } from '@/types/prestation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';

function firstOfMonth(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Commissions calculées, groupées par employé, sur une période libre. */
export function CommissionsReportPanel() {
    const { t } = useI18n();
    const [from, setFrom] = useState(firstOfMonth());
    const [to, setTo] = useState(today());
    const [employeeId, setEmployeeId] = useState<'all' | number>('all');
    const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', 'reports-commissions'],
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
    });

    const { data: report, isPending, isError, error, refetch } = useQuery({
        queryKey: ['reports', 'commissions', from, to, employeeId],
        queryFn: () =>
            getCommissionsReport({ from, to, employeeId: employeeId === 'all' ? undefined : employeeId }),
    });

    const detailsByEmployee = useMemo(() => {
        const map = new Map<string, CommissionsReport['details']>();
        (report?.details ?? []).forEach((detail) => {
            const bucket = map.get(detail.employee_name);
            if (bucket) bucket.push(detail);
            else map.set(detail.employee_name, [detail]);
        });
        return map;
    }, [report?.details]);

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <h3 className="mt-4 font-semibold">{t('Impossible de charger les commissions')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{getErrorMessage(error)}</p>
                <Button className="mt-5" variant="accent" onClick={() => void refetch()}>
                    {t('Réessayer')}
                </Button>
            </Card>
        );
    }

    return (
        <div className="space-y-5">
            <Card>
                <CardContent className="flex flex-wrap items-end gap-4 p-4">
                    <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t('Du')}
                        <input
                            type="date"
                            value={from}
                            onChange={(event) => setFrom(event.target.value)}
                            className="block h-10 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors focus:border-accent/60"
                        />
                    </label>
                    <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t('Au')}
                        <input
                            type="date"
                            value={to}
                            onChange={(event) => setTo(event.target.value)}
                            className="block h-10 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors focus:border-accent/60"
                        />
                    </label>
                    <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t('Employé')}
                        <select
                            value={employeeId}
                            onChange={(event) =>
                                setEmployeeId(event.target.value === 'all' ? 'all' : Number(event.target.value))
                            }
                            className="block h-10 min-w-[200px] rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors focus:border-accent/60"
                        >
                            <option value="all">{t('Tous les employés')}</option>
                            {employees.map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                    {employee.name}
                                </option>
                            ))}
                        </select>
                    </label>
                </CardContent>
            </Card>

            {isPending ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 rounded-md" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ReportStat label={t('Total commissions')} value={formatCurrency(report?.total ?? 0)} />
                    <ReportStat label={t('Commissions annulées')} value={formatCurrency(report?.cancelled_total ?? 0)} />
                </div>
            )}

            {isPending ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-16 rounded-md" />
                    ))}
                </div>
            ) : (report?.by_employee ?? []).length === 0 ? (
                <EmptyState
                    icon={HandCoins}
                    title={t('Aucune commission sur cette période')}
                    description={t("Ajustez les dates ou l'employé sélectionné pour élargir la recherche.")}
                />
            ) : (
                <div className="space-y-3">
                    {(report?.by_employee ?? []).map((group) => {
                        const expanded = expandedEmployee === group.employee_id;
                        const details = detailsByEmployee.get(group.employee_name) ?? [];

                        return (
                            <Card key={group.employee_id} className="overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setExpandedEmployee(expanded ? null : group.employee_id)}
                                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">{group.employee_name}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {group.count} {t(group.count > 1 ? 'commissions' : 'commission')}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className="text-sm font-semibold tabular-nums text-accent">
                                            {formatCurrency(group.total)}
                                        </span>
                                        <ChevronDown
                                            className={cn(
                                                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                                                expanded && 'rotate-180',
                                            )}
                                        />
                                    </div>
                                </button>

                                {expanded && (
                                    <div className="border-t border-tint/[0.06] px-4 py-3">
                                        <ul className="space-y-1.5">
                                            {details.map((detail) => (
                                                <li
                                                    key={detail.id}
                                                    className={cn(
                                                        'flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2',
                                                        detail.is_deleted && 'opacity-70',
                                                    )}
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-foreground">
                                                            {detail.service_name} · {detail.prestation_reference}
                                                        </p>
                                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                            {formatDate(detail.date)}
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-2">
                                                        <span className={cn('text-sm font-semibold tabular-nums', detail.is_deleted && 'line-through')}>
                                                            {formatCurrency(detail.amount)}
                                                        </span>
                                                        <Badge variant={detail.is_deleted ? 'destructive' : detail.status === 'validated' ? 'success' : 'outline'}>
                                                            {detail.is_deleted
                                                                ? 'Supprimée'
                                                                : detail.status === 'validated' ? 'Validée' : 'Annulée'}
                                                        </Badge>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function ReportStat({ label, value }: { label: string; value: string }) {
    const { t } = useI18n();
    return (
        <Card className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{t(label)}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        </Card>
    );
}
