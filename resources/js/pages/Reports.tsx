import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, BarChart3, Download, Printer, ReceiptText } from 'lucide-react';
import {
    getErrorMessage,
    getMonthlyReport,
    getMonthlyReportPdfUrl,
    getPeriods,
    getTransactions,
    getWorkDayPdfUrl,
    getWorkDays,
    recordTransactionPrint,
} from '@/lib/api';
import { PeriodStatusBadge } from '@/components/closure/PeriodSelector';
import { cn, formatCurrency, formatDayLabel, formatTime } from '@/lib/utils';
import { pageFade } from '@/lib/motion';
import { t as tr, useI18n } from '@/lib/i18n';
import { printSaleReceipt, type TicketFormat } from '@/lib/receipt';
import type { ClosingReport, RevenueByEmployee, Sale, WorkDay } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { getCategoryLabel } from '@/components/workday/categories';
import { AdvancesReportPanel } from '@/components/reports/AdvancesReportPanel';
import { CommissionsReportPanel } from '@/components/reports/CommissionsReportPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function reportFor(day: WorkDay): ClosingReport | null {
    return day.report_snapshot ?? day.closing_report;
}

function dayRevenue(day: WorkDay): number {
    return reportFor(day)?.revenue_total ?? 0;
}

function dayNet(day: WorkDay): number {
    return reportFor(day)?.net_result ?? 0;
}

function clientName(sale: Sale): string {
    if (sale.client) return sale.client.name;
    if (sale.client_label) return sale.client_label;
    return tr('Client de passage');
}

function ReportStat({ label, value }: { label: string; value: string }) {
    const { t } = useI18n();
    return (
        <div className="rounded-md border border-tint/[0.06] bg-tint/[0.025] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t(label)}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
        </div>
    );
}

function monthValue(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function MonthlyReportPanel({ month }: { month: string }) {
    const { t } = useI18n();
    const { data: report, isPending, isError, error } = useQuery({
        queryKey: ['reports', 'monthly', month],
        queryFn: () => getMonthlyReport(month),
        refetchInterval: 15_000,
    });

    if (isPending) {
        return <Skeleton className="h-96 rounded-md" />;
    }

    if (isError || !report) {
        return (
            <Card className="border-destructive/25 bg-destructive/[0.04] p-5 text-sm text-destructive">
                {getErrorMessage(error, t('Impossible de charger le rapport mensuel.'))}
            </Card>
        );
    }

    const totals = report.totals;
    const employees = totals.employee_by_prestation ?? totals.revenue_by_employee;
    const prestations = totals.prestation_by_employee ?? totals.top_prestations.map((row) => ({
        ...row,
        employees: [],
    }));

    return (
        <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div>
                    <CardTitle>{t('Rapport du mois')}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t('Du {start} au {end}', { start: formatDayLabel(report.period.start), end: formatDayLabel(report.period.end) })}
                    </p>
                </div>
                <Button asChild variant="outline" size="sm">
                    <a href={getMonthlyReportPdfUrl(month)} target="_blank" rel="noreferrer">
                        <Download /> {t('PDF mensuel')}
                    </a>
                </Button>
            </CardHeader>

            <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                    <ReportStat label={t('CA')} value={formatCurrency(totals.revenue_total)} />
                    <ReportStat label={t('Depenses')} value={formatCurrency(totals.expenses_total)} />
                    <ReportStat label={t('Avances')} value={formatCurrency(totals.advances_total)} />
                    <ReportStat label={t('Resultat de la caisse')} value={formatCurrency(totals.net_result)} />
                    <ReportStat label={t('Tickets')} value={String(totals.ticket_count ?? 0)} />
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <ReportTable title={t('Employes par CA et prestation')}>
                        {employees.map((row) => (
                            <div key={row.employee_id} className="flex items-start justify-between gap-3 border-b border-tint/[0.06] py-2 last:border-0">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{row.employee_name}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {row.count} {t(row.count > 1 ? 'tickets' : 'ticket')} - {(row.prestations ?? []).map((item) => `${item.label} (${item.count})`).join(', ') || t('Aucune prestation detaillee')}
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">{formatCurrency(row.total)}</span>
                            </div>
                        ))}
                    </ReportTable>

                    <ReportTable title={t('Prestations par employe')}>
                        {prestations.map((row) => (
                            <div key={row.label} className="flex items-start justify-between gap-3 border-b border-tint/[0.06] py-2 last:border-0">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{row.label}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {row.count} {t(row.count > 1 ? 'passages' : 'passage')} - {(row.employees ?? []).map((employee) => `${employee.employee_name} (${employee.count})`).join(', ') || t('Employe non detaille')}
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">{formatCurrency(row.total)}</span>
                            </div>
                        ))}
                    </ReportTable>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <ReportTable title={t('Depenses detaillees')}>
                        {(totals.expense_details ?? []).map((expense) => (
                            <div key={expense.id ?? `${expense.spent_on}-${expense.label}`} className="flex items-center justify-between gap-3 border-b border-tint/[0.06] py-2 last:border-0">
                                <div className="min-w-0"><p className="truncate text-sm">{expense.label}</p><p className="text-xs text-muted-foreground">{expense.spent_on} - {expense.category}</p></div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-destructive">{formatCurrency(expense.amount ?? expense.total)}</span>
                            </div>
                        ))}
                        {(totals.expense_details ?? []).length === 0 && <p className="py-2 text-sm text-muted-foreground">{t('Aucune depense.')}</p>}
                    </ReportTable>

                    <ReportTable title={t('Avances detaillees')}>
                        {(totals.advance_details ?? []).map((advance) => (
                            <div key={advance.id ?? `${advance.given_on}-${advance.employee_id}`} className="flex items-center justify-between gap-3 border-b border-tint/[0.06] py-2 last:border-0">
                                <div className="min-w-0"><p className="truncate text-sm">{advance.employee_name}</p><p className="text-xs text-muted-foreground">{advance.given_on} - {advance.reason || t('Sans motif')} - {t(advance.settled_at ? 'Reglee' : 'Non reglee')}</p></div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-destructive">{formatCurrency(advance.amount ?? advance.total)}</span>
                            </div>
                        ))}
                        {(totals.advance_details ?? []).length === 0 && <p className="py-2 text-sm text-muted-foreground">{t('Aucune avance.')}</p>}
                    </ReportTable>
                </div>

                <ReportTable title={t('Historique journee par journee')}>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                            <thead className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                                <tr><th className="pb-2">{t('Journee')}</th><th className="pb-2">{t('Statut')}</th><th className="pb-2 text-right">{t('Tickets')}</th><th className="pb-2 text-right">{t('CA')}</th><th className="pb-2 text-right">{t('Depenses')}</th><th className="pb-2 text-right">{t('Avances')}</th><th className="pb-2 text-right">{t('Resultat')}</th></tr>
                            </thead>
                            <tbody>
                                {report.days.map((day) => (
                                    <tr key={day.id} className="border-t border-tint/[0.06]">
                                        <td className="py-2">{formatDayLabel(day.date)}</td><td className="py-2 text-muted-foreground">{t(day.status === 'closed' ? 'Cloturee' : 'Ouverte')}</td><td className="py-2 text-right tabular-nums">{day.tickets}{day.deleted_tickets ? ` ${t('+ {n} suppr.', { n: day.deleted_tickets })}` : ''}</td><td className="py-2 text-right tabular-nums text-accent">{formatCurrency(day.revenue_total)}</td><td className="py-2 text-right tabular-nums">{formatCurrency(day.expenses_total)}</td><td className="py-2 text-right tabular-nums">{formatCurrency(day.advances_total)}</td><td className="py-2 text-right tabular-nums">{formatCurrency(day.net_result)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ReportTable>
            </CardContent>
        </Card>
    );
}

function ReportTable({ title, children }: { title: string; children: React.ReactNode }) {
    const { t } = useI18n();
    return (
        <section className="rounded-md border border-tint/[0.06] bg-tint/[0.02] px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t(title)}</h3>
            <div className="mt-2">{children}</div>
        </section>
    );
}

function EmployeeTicketsDialog({
    day,
    employee,
    open,
    onOpenChange,
}: {
    day: WorkDay;
    employee: RevenueByEmployee | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [printFormat, setPrintFormat] = useState<TicketFormat>('58mm');
    const ticketsQueryKey = ['work-day', day.id, 'tickets'] as const;
    const { data: sales, isPending } = useQuery({
        queryKey: ticketsQueryKey,
        queryFn: () => getTransactions(day.id),
        enabled: open,
    });

    const printMutation = useMutation({
        mutationFn: recordTransactionPrint,
        onSuccess: (printedSale) => {
            queryClient.setQueryData<Sale[]>(
                ticketsQueryKey,
                (current) => current?.map((sale) => (sale.id === printedSale.id ? printedSale : sale)) ?? [printedSale],
            );
            void printSaleReceipt(printedSale, {
                format: printFormat,
                duplicata: printedSale.print_count > 1,
            });
        },
    });

    const employeeSales = (sales ?? []).filter(
        (sale) => sale.employee.id === employee?.employee_id,
    );
    const activeTotal = employeeSales
        .filter((sale) => !sale.is_deleted)
        .reduce((sum, sale) => sum + sale.total, 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t('Tickets de {name}', { name: employee?.employee_name ?? t('employé') })}</DialogTitle>
                    <DialogDescription>
                        {t('Journée du {date} · {amount} encaissés', {
                            date: formatDayLabel(day.date),
                            amount: formatCurrency(activeTotal, { maximumFractionDigits: 2 }),
                        })}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t('Format')}
                    </span>
                    {(['58mm', '80mm', 'a4'] as TicketFormat[]).map((format) => (
                        <button
                            key={format}
                            type="button"
                            onClick={() => setPrintFormat(format)}
                            className={cn(
                                'rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200',
                                printFormat === format
                                    ? 'border-accent/60 bg-accent/[0.12] text-foreground'
                                    : 'border-tint/[0.08] text-muted-foreground hover:border-accent/30',
                            )}
                        >
                            {format === 'a4' ? 'A4' : format}
                        </button>
                    ))}
                </div>

                {isPending ? (
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <Skeleton key={index} className="h-16 rounded-md" />
                        ))}
                    </div>
                ) : employeeSales.length === 0 ? (
                    <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-8 text-center text-sm text-muted-foreground">
                        {t('Aucun ticket pour cet employé sur cette journée.')}
                    </div>
                ) : (
                    <ScrollArea className="max-h-[520px] pr-3">
                        <div className="space-y-2">
                            {employeeSales.map((sale) => (
                                <div
                                    key={sale.id}
                                    className={cn(
                                        'rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2.5',
                                        sale.is_deleted &&
                                            'border-destructive/25 bg-destructive/[0.06]',
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-xs tabular-nums text-muted-foreground">
                                                    #{sale.id} · {formatTime(sale.created_at)}
                                                </span>
                                                <Badge variant="accent">
                                                    {getCategoryLabel(sale.category)}
                                                </Badge>
                                                {sale.is_deleted && (
                                                    <Badge variant="destructive">{t('Supprimé')}</Badge>
                                                )}
                                            </div>
                                            <p className="mt-1 truncate text-sm font-medium text-foreground">
                                                {sale.items.length > 0
                                                    ? sale.items
                                                          .map((item) =>
                                                              item.quantity > 1
                                                                  ? `${item.label} x${item.quantity}`
                                                                  : item.label,
                                                          )
                                                          .join(', ')
                                                    : getCategoryLabel(sale.category)}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {clientName(sale)} ·{' '}
                                                {t('{n} tickets', { n: sale.printed_ticket_count ?? sale.print_count * 2 })}
                                                {' '}· {t('{n} impr.', { n: sale.print_count })}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2">
                                            <p
                                                className={cn(
                                                    'text-sm font-semibold tabular-nums text-foreground',
                                                    sale.is_deleted &&
                                                        'text-muted-foreground line-through decoration-destructive/70',
                                                )}
                                            >
                                                {formatCurrency(sale.total, {
                                                    maximumFractionDigits: 2,
                                                })}
                                            </p>
                                            {!sale.is_deleted && (
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8"
                                                    aria-label={t('Réimprimer le ticket')}
                                                    disabled={printMutation.isPending}
                                                    onClick={() => printMutation.mutate(sale.id)}
                                                >
                                                    <Printer className="text-muted-foreground" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Ou est parti le resultat de cette journee.
 *
 * Purement informatif : aucun chiffre du rapport n'en depend, et une journee
 * anterieure au demarrage du portefeuille s'affiche exactement comme avant,
 * avec une mention qui explique pourquoi elle n'a rien credite plutot que de
 * laisser croire a un oubli.
 */
function WalletDayStatus({ day }: { day: WorkDay }) {
    const { t } = useI18n();
    const wallet = day.wallet;

    if (!wallet) return null;

    const startLabel = new Date(`${wallet.start_date}T00:00:00`).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    if (wallet.status === 'credited') {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-success/25 bg-success/[0.08] px-3 py-2 text-sm">
                <Badge variant="success">{t('Portefeuille crédité')}</Badge>
                <span className="tabular-nums font-semibold">
                    +{formatCurrency(wallet.amount ?? 0, { maximumFractionDigits: 2 })}
                </span>
                {wallet.wallet_owner && (
                    <span className="text-muted-foreground">
                        {t('vers le portefeuille de {name}', { name: wallet.wallet_owner })}
                    </span>
                )}
            </div>
        );
    }

    if (wallet.status === 'reversed') {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/[0.08] px-3 py-2 text-sm">
                <Badge variant="destructive">{t('Crédit contre-passé')}</Badge>
                <span className="text-muted-foreground">
                    {t('Un ajustement a annulé ce crédit ; les deux mouvements restent dans l’historique.')}
                </span>
            </div>
        );
    }

    if (wallet.status === 'out_of_scope') {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.02] px-3 py-2 text-sm">
                <Badge variant="outline">{t('Hors portefeuille')}</Badge>
                <span className="text-muted-foreground">
                    {t('Journée antérieure au {date} : elle reste dans les rapports, sans alimenter aucun solde.', {
                        date: startLabel,
                    })}
                </span>
            </div>
        );
    }

    if (wallet.status === 'zero') {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.02] px-3 py-2 text-sm">
                <Badge variant="outline">{t('Aucun mouvement')}</Badge>
                <span className="text-muted-foreground">{t('Résultat nul : rien à créditer.')}</span>
            </div>
        );
    }

    if (wallet.status === 'not_credited') {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/[0.08] px-3 py-2 text-sm">
                <Badge variant="destructive">{t('Non crédité')}</Badge>
                <span className="text-muted-foreground">
                    {t("Aucun responsable identifié pour cette journée — à signaler au Super Admin.")}
                </span>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.02] px-3 py-2 text-sm">
            <Badge variant="outline">{t('En attente de clôture')}</Badge>
            <span className="text-muted-foreground">
                {t('Le résultat sera crédité au portefeuille à la clôture de la journée.')}
            </span>
        </div>
    );
}

function WorkDayReportCard({ day }: { day: WorkDay }) {
    const { t } = useI18n();
    const report = reportFor(day);
    const statusLabel = day.status === 'open' ? 'Ouverte' : 'Clôturée';
    const statusVariant = day.status === 'open' ? 'success' : 'outline';
    const [ticketsEmployee, setTicketsEmployee] = useState<RevenueByEmployee | null>(null);

    return (
        <>
            <Card>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle>{t('Journée du {date}', { date: formatDayLabel(day.date) })}</CardTitle>
                            <Badge variant={statusVariant}>{t(statusLabel)}</Badge>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {t('{count} en service · fond de caisse {amount}', {
                                count: `${day.employees.length} ${t(day.employees.length > 1 ? 'employés' : 'employé')}`,
                                amount: formatCurrency(day.opening_balance, { maximumFractionDigits: 2 }),
                            })}
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
                            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                <ReportStat
                                    label={t('CA')}
                                    value={formatCurrency(report.revenue_total, {
                                        maximumFractionDigits: 2,
                                    })}
                                />
                                <ReportStat
                                    label={t('Dépenses')}
                                    value={formatCurrency(report.expenses_total, {
                                        maximumFractionDigits: 2,
                                    })}
                                />
                                <ReportStat
                                    label={t('Avances')}
                                    value={formatCurrency(report.advances_total, {
                                        maximumFractionDigits: 2,
                                    })}
                                />
                                <ReportStat
                                    label={t('Résultat de la caisse')}
                                    value={formatCurrency(report.net_result, {
                                        maximumFractionDigits: 2,
                                    })}
                                />
                            </div>

                            <WalletDayStatus day={day} />

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <section className="space-y-2">
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        {t('Par catégorie')}
                                    </h3>
                                    <div className="space-y-2">
                                        {report.revenue_by_category.map((row) => (
                                            <div
                                                key={row.category}
                                                className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2"
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
                                        {t('Par employé')}
                                    </h3>
                                    <div className="space-y-2">
                                        {report.revenue_by_employee.map((row) => (
                                            <div
                                                key={row.employee_id}
                                                className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2"
                                            >
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm">
                                                        {row.employee_name}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {row.count} {t(row.count > 1 ? 'tickets' : 'ticket')}
                                                    </span>
                                                    {(row.prestations ?? []).length > 0 && (
                                                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                                            {(row.prestations ?? [])
                                                                .map((prestation) => `${prestation.label} (${prestation.count})`)
                                                                .join(', ')}
                                                        </span>
                                                    )}
                                                </span>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <span className="text-sm font-semibold tabular-nums text-accent">
                                                        {formatCurrency(row.total, {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setTicketsEmployee(row)}
                                                    >
                                                        <ReceiptText />
                                                        {t('Tickets')}
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className="space-y-2">
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        {t('Top prestations')}
                                    </h3>
                                    <div className="space-y-2">
                                        {report.top_prestations.map((row) => (
                                            <div
                                                key={row.label}
                                                className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2"
                                            >
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm">
                                                        {row.label}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {row.count}{' '}
                                                        {t(row.count > 1 ? 'passages' : 'passage')}
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

                            <section className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        {t('Détails avances')}
                                    </h3>
                                    <span className="text-xs text-muted-foreground">
                                        {day.advances.length}{' '}
                                        {t(day.advances.length > 1 ? 'avances' : 'avance')}
                                    </span>
                                </div>

                                {day.advances.length === 0 ? (
                                    <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-4 text-sm text-muted-foreground">
                                        {t('Aucune avance enregistrée sur cette journée.')}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                        {day.advances.map((advance) => (
                                            <div
                                                key={advance.id}
                                                className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2"
                                            >
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-medium">
                                                        {advance.employee_name ?? t('Employé')}
                                                    </span>
                                                    <span className="block truncate text-xs text-muted-foreground">
                                                        {advance.reason || t('Sans motif')} ·{' '}
                                                        {t(advance.settled_at
                                                            ? 'réglée'
                                                            : 'non réglée')}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 text-sm font-semibold tabular-nums text-destructive">
                                                    {formatCurrency(advance.amount, {
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <section className="space-y-2">
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        {t('Dépenses détaillées')}
                                    </h3>
                                    {(report.expense_details ?? []).length === 0 ? (
                                        <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-4 text-sm text-muted-foreground">
                                            {t('Aucune dépense enregistrée sur cette journée.')}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {(report.expense_details ?? []).map((expense) => (
                                                <div key={expense.id ?? `${expense.spent_on}-${expense.label}`} className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2">
                                                    <span className="min-w-0"><span className="block truncate text-sm">{expense.label}</span><span className="text-xs text-muted-foreground">{expense.spent_on} - {expense.category}</span></span>
                                                    <span className="shrink-0 text-sm font-semibold tabular-nums text-destructive">{formatCurrency(expense.amount ?? expense.total, { maximumFractionDigits: 2 })}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section className="space-y-2">
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        {t('Moyens de paiement')}
                                    </h3>
                                    {(report.payment_methods ?? []).length === 0 ? (
                                        <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-4 text-sm text-muted-foreground">
                                            {t('Aucun paiement enregistré.')}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {(report.payment_methods ?? []).map((payment) => (
                                                <div key={payment.method} className="flex items-center justify-between rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2">
                                                    <span className="text-sm">{payment.method} <span className="text-xs text-muted-foreground">({payment.count})</span></span>
                                                    <span className="text-sm font-semibold tabular-nums text-accent">{formatCurrency(payment.total, { maximumFractionDigits: 2 })}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>
                        </>
                    ) : (
                        <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-sm text-muted-foreground">
                            {t('Les totaux seront disponibles dès les premiers encaissements. Le PDF sera disponible après clôture.')}
                        </div>
                    )}
                </CardContent>
            </Card>
            <EmployeeTicketsDialog
                day={day}
                employee={ticketsEmployee}
                open={ticketsEmployee !== null}
                onOpenChange={(open) => {
                    if (!open) setTicketsEmployee(null);
                }}
            />
        </>
    );
}

export default function Reports() {
    const { t } = useI18n();
    const [month, setMonth] = useState(monthValue);
    const [dailyFrom, setDailyFrom] = useState('');
    const [dailyTo, setDailyTo] = useState('');
    const [dailyStatus, setDailyStatus] = useState<'all' | 'open' | 'closed'>('all');
    const [dailyEmployee, setDailyEmployee] = useState('all');
    const {
        data: workDays,
        isPending,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ['work-days', 'reports'],
        queryFn: getWorkDays,
        refetchInterval: 15_000,
    });

    const employeeOptions = useMemo(() => {
        const employees = new Map<number, string>();
        (workDays ?? []).forEach((day) => {
            day.employees.forEach((employee) => employees.set(employee.id, employee.name));
            (day.closing_report?.revenue_by_employee ?? []).forEach((employee) => {
                employees.set(employee.employee_id, employee.employee_name);
            });
        });
        return Array.from(employees.entries()).sort((a, b) => a[1].localeCompare(b[1], 'fr'));
    }, [workDays]);

    const filteredWorkDays = useMemo(() => (workDays ?? []).filter((day) => {
        const inFrom = !dailyFrom || day.date >= dailyFrom;
        const inTo = !dailyTo || day.date <= dailyTo;
        const inStatus = dailyStatus === 'all' || day.status === dailyStatus;
        const inEmployee = dailyEmployee === 'all'
            || day.employees.some((employee) => String(employee.id) === dailyEmployee)
            || (day.closing_report?.revenue_by_employee ?? []).some((employee) => String(employee.employee_id) === dailyEmployee);
        return inFrom && inTo && inStatus && inEmployee;
    }), [dailyEmployee, dailyFrom, dailyStatus, dailyTo, workDays]);

    const totals = useMemo(() => ({
        days: filteredWorkDays.length,
        closedDays: filteredWorkDays.filter((day) => day.status === 'closed').length,
        revenue: filteredWorkDays.reduce((sum, day) => sum + dayRevenue(day), 0),
        net: filteredWorkDays.reduce((sum, day) => sum + dayNet(day), 0),
    }), [filteredWorkDays]);

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
                <h2 className="mt-4 text-base font-semibold">{t('Impossible de charger les rapports')}</h2>
                <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                    {getErrorMessage(error)}
                </p>
                <Button variant="accent" className="mt-6" onClick={() => void refetch()}>
                    {t('Réessayer')}
                </Button>
            </Card>
        );
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <Tabs defaultValue="monthly" className="space-y-5">
                <TabsList>
                    <TabsTrigger value="monthly">{t('Rapport mensuel')}</TabsTrigger>
                    <TabsTrigger value="daily">{t('Rapports par jour')}</TabsTrigger>
                    <TabsTrigger value="advances">{t('Avances')}</TabsTrigger>
                    <TabsTrigger value="commissions">{t('Commissions')}</TabsTrigger>
                </TabsList>
                <TabsContent value="monthly" className="space-y-5">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Rapports')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Historique des journées de caisse, totaux et rapports de clôture.')}
                </p>
            </div>

            <Card>
                <CardContent className="flex flex-wrap items-end justify-between gap-4 p-4">
                    <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t('Periode mensuelle')}
                        <input
                            type="month"
                            value={month}
                            onChange={(event) => setMonth(event.target.value)}
                            className="block h-10 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors focus:border-accent/60"
                        />
                    </label>
                    <div className="space-y-2">
                        {/* Le statut du mois se lit ici aussi : le rapport d'un mois
                            cloture est fige, celui d'un mois a finaliser bougera
                            encore. */}
                        <ReportPeriodStatus month={month} />
                        <span className="block text-sm text-muted-foreground">{t('Les totaux utilisent les journees de caisse, pas seulement la date d’encaissement.')}</span>
                    </div>
                </CardContent>
            </Card>

            <MonthlyReportPanel month={month} />

                </TabsContent>
                <TabsContent value="daily" className="space-y-5">

            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Rapports par jour')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{t('Filtrez et ouvrez le détail de chaque journée de caisse.')}</p>
            </div>

            <Card>
                <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('Du')}<input type="date" value={dailyFrom} onChange={(event) => setDailyFrom(event.target.value)} className="block h-10 w-full rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm" /></label>
                    <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('Au')}<input type="date" value={dailyTo} onChange={(event) => setDailyTo(event.target.value)} className="block h-10 w-full rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm" /></label>
                    <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('Statut')}<select value={dailyStatus} onChange={(event) => setDailyStatus(event.target.value as 'all' | 'open' | 'closed')} className="block h-10 w-full rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm"><option value="all">{t('Toutes')}</option><option value="open">{t('Ouvertes')}</option><option value="closed">{t('Cloturees')}</option></select></label>
                    <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('Employe')}<select value={dailyEmployee} onChange={(event) => setDailyEmployee(event.target.value)} className="block h-10 w-full rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm"><option value="all">{t('Tous les employes')}</option>{employeeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <ReportStat label={t('Journées')} value={String(totals.days)} />
                <ReportStat label={t('Clôturées')} value={String(totals.closedDays)} />
                <ReportStat
                    label={t('CA historique')}
                    value={formatCurrency(totals.revenue, { maximumFractionDigits: 2 })}
                />
                <ReportStat
                    label={t('Résultat historique')}
                    value={formatCurrency(totals.net, { maximumFractionDigits: 2 })}
                />
            </div>

            {filteredWorkDays.length === 0 ? (
                <EmptyState
                    icon={BarChart3}
                    title={t('Aucune journée de caisse')}
                    description={t('Les rapports apparaîtront ici après ouverture puis clôture de vos journées.')}
                />
            ) : (
                <div className="space-y-4">
                    {filteredWorkDays.map((day) => (
                        <WorkDayReportCard key={day.id} day={day} />
                    ))}
                </div>
            )}
                </TabsContent>
                <TabsContent value="advances" className="space-y-5">

            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Gestion des avances')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Avances sur salaire par employé et par période, avec suppression protégée par mot de passe patron.')}
                </p>
            </div>

            <AdvancesReportPanel />

                </TabsContent>
                <TabsContent value="commissions" className="space-y-5">

            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Commissions')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Commissions calculées à la confirmation des paiements, par employé et par période.')}
                </p>
            </div>

            <CommissionsReportPanel />

                </TabsContent>
            </Tabs>
        </motion.div>
    );
}

/**
 * Statut de la periode affichee dans les rapports.
 *
 * Rappel important : ce panneau utilise l'ancrage `work_days.date`, celui des
 * rapports de caisse — la paie, elle, suit `commissions.created_at`. Les deux
 * peuvent differer sur une operation de nuit, et cet ecart est volontairement
 * conserve (voir MonthlyClosureService).
 */
function ReportPeriodStatus({ month }: { month: string }) {
    const { data } = useQuery({ queryKey: ['periods'], queryFn: getPeriods });
    if (!data) return null;

    const status = data.closed.some((entry) => entry.period === month)
        ? ('closed' as const)
        : month === data.current
          ? ('current' as const)
          : data.to_finalize.some((entry) => entry.period === month)
            ? ('to_finalize' as const)
            : null;

    if (status === null) return null;

    return <PeriodStatusBadge status={status} />;
}
