import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarCheck, ChevronDown, Lock } from 'lucide-react';
import { getErrorMessage, getMonthlyClosures } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { formatPeriod } from '@/components/closure/PeriodSelector';
import { pageFade } from '@/lib/motion';

/**
 * Historique des clôtures — Super Admin (`months.history.view`).
 *
 * Un mois clôturé quitte définitivement les écrans de l'Admin : c'est le seul
 * chemin qui y ramène. Lecture seule, sans réouverture possible — lever le
 * verrou obligerait à réécrire tout ce qu'il a figé.
 */
export default function MonthlyClosures() {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState<string | null>(null);

    const { data, isPending, isError, error } = useQuery({
        queryKey: ['monthly-closures'],
        queryFn: getMonthlyClosures,
    });

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Historique des clôtures')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Mois définitivement clôturés — qui, quand, et le rapport figé au moment de la clôture.')}
                </p>
            </div>

            {isPending && (
                <div className="space-y-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            )}

            {isError && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {getErrorMessage(error)}
                </p>
            )}

            {data && data.length === 0 && (
                <EmptyState
                    icon={CalendarCheck}
                    title={t('Aucun mois clôturé')}
                    description={t('Les mois clôturés apparaîtront ici avec leur rapport figé.')}
                />
            )}

            {data?.map((closure) => {
                const open = expanded === closure.period;
                const report = closure.closing_report;

                return (
                    <Card key={closure.id}>
                        <CardContent className="p-0">
                            <button
                                type="button"
                                onClick={() => setExpanded(open ? null : closure.period)}
                                className="flex w-full items-center gap-3 p-4 text-left"
                            >
                                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold capitalize">{formatPeriod(closure.period)}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {t('Clôturé le')} {new Date(closure.closed_at).toLocaleString('fr-FR')}
                                        {closure.closed_by ? ` ${t('par')} ${closure.closed_by}` : ''}
                                    </p>
                                </div>
                                <div className="hidden shrink-0 gap-6 text-right sm:flex">
                                    <Metric label={t('Employés')} value={String(closure.employees_count)} />
                                    <Metric label={t('Commissions')} value={formatCurrency(closure.commission_total)} />
                                    <Metric label={t('Versements')} value={formatCurrency(closure.payouts_total)} />
                                    <Metric label={t('Journées')} value={String(closure.work_days_count)} />
                                </div>
                                <ChevronDown
                                    className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {open && (
                                <div className="space-y-4 border-t p-4">
                                    {closure.notes && (
                                        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                                            {closure.notes}
                                        </p>
                                    )}

                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        <Metric label={t('Employés')} value={String(closure.employees_count)} />
                                        <Metric
                                            label={t('Commissions')}
                                            value={formatCurrency(closure.commission_total)}
                                        />
                                        <Metric label={t('Versements')} value={formatCurrency(closure.payouts_total)} />
                                        <Metric
                                            label={t('Avances appliquées')}
                                            value={formatCurrency(closure.advances_applied_total)}
                                        />
                                    </div>

                                    {report && (
                                        <>
                                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {t('Employés au moment de la clôture')}
                                            </h3>
                                            <ul className="divide-y rounded-lg border">
                                                {report.employees.map((row) => (
                                                    <li
                                                        key={row.employee_id}
                                                        className="flex items-center justify-between gap-3 p-3 text-sm"
                                                    >
                                                        <span className="truncate">{row.employee_name}</span>
                                                        <span className="shrink-0 text-muted-foreground">
                                                            {formatCurrency(row.earned)}
                                                            {row.carry_forward_advance > 0 && (
                                                                <>
                                                                    {' · '}
                                                                    {t('avance reportée')}{' '}
                                                                    {formatCurrency(row.carry_forward_advance)}
                                                                </>
                                                            )}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <p className="text-xs text-muted-foreground">
                                                {t('Journées de caisse')} : {report.work_days.total} —{' '}
                                                {report.work_days.all_closed
                                                    ? t('toutes clôturées')
                                                    : t('anomalie : journées ouvertes au moment de la clôture')}
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </motion.div>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold tabular-nums">{value}</p>
        </div>
    );
}
