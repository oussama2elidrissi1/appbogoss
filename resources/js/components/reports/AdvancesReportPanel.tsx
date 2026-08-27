import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, HandCoins, Trash2 } from 'lucide-react';
import { deleteAdvance, getAdvancesReport, getEmployees, getErrorMessage } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { AdvancesReportDetail } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PatronPasswordDialog } from '@/components/workday/PatronPasswordDialog';

function firstOfMonth(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** "Gestion des avances" — filtrable par employé et par période, groupé par employé. */
export function AdvancesReportPanel() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [from, setFrom] = useState(firstOfMonth());
    const [to, setTo] = useState(today());
    const [employeeId, setEmployeeId] = useState<'all' | number>('all');
    const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);
    const [deletingAdvance, setDeletingAdvance] = useState<AdvancesReportDetail | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', 'reports-advances'],
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
    });

    const reportKey = ['reports', 'advances', from, to, employeeId] as const;
    const { data: report, isPending, isError, error, refetch } = useQuery({
        queryKey: reportKey,
        queryFn: () =>
            getAdvancesReport({
                from,
                to,
                employeeId: employeeId === 'all' ? undefined : employeeId,
            }),
    });

    const detailsByEmployee = useMemo(() => {
        const map = new Map<number, AdvancesReportDetail[]>();
        (report?.details ?? []).forEach((detail) => {
            const bucket = map.get(detail.employee_id);
            if (bucket) bucket.push(detail);
            else map.set(detail.employee_id, [detail]);
        });
        return map;
    }, [report?.details]);

    const deleteMutation = useMutation({
        mutationFn: ({ id, password }: { id: number; password: string }) => deleteAdvance(id, password),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['reports', 'advances'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setDeletingAdvance(null);
            setPasswordError(null);
        },
        onError: (mutationError) => setPasswordError(getErrorMessage(mutationError)),
    });

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <h3 className="mt-4 font-semibold">{t('Impossible de charger les avances')}</h3>
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 rounded-md" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <ReportStat label={t('Total avances')} value={formatCurrency(report?.total ?? 0, { maximumFractionDigits: 2 })} />
                    <ReportStat
                        label={t('Réglées')}
                        value={formatCurrency(report?.settled_total ?? 0, { maximumFractionDigits: 2 })}
                    />
                    <ReportStat
                        label={t('En cours')}
                        value={formatCurrency(report?.outstanding_total ?? 0, { maximumFractionDigits: 2 })}
                    />
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
                    title={t('Aucune avance sur cette période')}
                    description={t("Ajustez les dates ou l'employé sélectionné pour élargir la recherche.")}
                />
            ) : (
                <div className="space-y-3">
                    {(report?.by_employee ?? []).map((group) => {
                        const expanded = expandedEmployee === group.employee_id;
                        const details = detailsByEmployee.get(group.employee_id) ?? [];

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
                                            {group.count} {t(group.count > 1 ? 'avances' : 'avance')}
                                            {group.outstanding_total > 0 && (
                                                <> · {formatCurrency(group.outstanding_total, { maximumFractionDigits: 2 })} {t('en cours')}</>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className="text-sm font-semibold tabular-nums text-accent">
                                            {formatCurrency(group.total, { maximumFractionDigits: 2 })}
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
                                                    className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium tabular-nums text-foreground">
                                                            {formatCurrency(detail.amount, { maximumFractionDigits: 2 })}
                                                        </p>
                                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                            {formatDate(detail.given_on)}
                                                            {detail.reason ? ` · ${detail.reason}` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-2">
                                                        <Badge variant={detail.settled_at ? 'success' : 'outline'}>
                                                            {t(detail.settled_at ? 'Réglée' : 'En cours')}
                                                        </Badge>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            aria-label={t("Supprimer l'avance")}
                                                            onClick={() => {
                                                                setPasswordError(null);
                                                                setDeletingAdvance(detail);
                                                            }}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                                        </Button>
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

            <PatronPasswordDialog
                open={deletingAdvance !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeletingAdvance(null);
                        setPasswordError(null);
                    }
                }}
                title={t('Supprimer cette avance ?')}
                description={
                    deletingAdvance
                        ? t("L'avance de {amount} ({name}, {date}) sera définitivement supprimée.", {
                              amount: formatCurrency(deletingAdvance.amount, { maximumFractionDigits: 2 }),
                              name: deletingAdvance.employee_name,
                              date: formatDate(deletingAdvance.given_on),
                          })
                        : undefined
                }
                loading={deleteMutation.isPending}
                error={passwordError}
                onConfirm={(password) => {
                    if (!deletingAdvance) return;
                    deleteMutation.mutate({ id: deletingAdvance.id, password });
                }}
            />
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
