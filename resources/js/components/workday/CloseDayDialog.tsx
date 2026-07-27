import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Download, Loader2, Lock } from 'lucide-react';
import { closeWorkDay, getErrorMessage, getWorkDayPdfUrl } from '@/lib/api';
import { useRefreshDay } from '@/hooks/useWorkDay';
import { cn, formatCurrency, formatDayLabel } from '@/lib/utils';
import type { ClosingReport, WorkDay } from '@/types/workday';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { getCategoryLabel } from './categories';

interface CloseDayDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workDay: WorkDay;
    /** Called once the operator dismisses the report — the day is closed by then. */
    onClosed: () => void;
}

function Metric({
    label,
    value,
    tone = 'default',
}: {
    label: string;
    value: string;
    tone?: 'default' | 'accent' | 'success' | 'destructive';
}) {
    return (
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </p>
            <p
                className={cn(
                    'mt-1 text-lg font-semibold tabular-nums leading-none',
                    tone === 'accent' && 'text-accent',
                    tone === 'success' && 'text-success',
                    tone === 'destructive' && 'text-destructive',
                    tone === 'default' && 'text-foreground',
                )}
            >
                {value}
            </p>
        </div>
    );
}

function Report({ report }: { report: ClosingReport }) {
    const categoryMax = Math.max(1, ...report.revenue_by_category.map((row) => row.total));

    return (
        <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Metric
                    label="Chiffre d'affaires"
                    value={formatCurrency(report.revenue_total, { maximumFractionDigits: 2 })}
                    tone="accent"
                />
                <Metric
                    label="Dépenses"
                    value={formatCurrency(report.expenses_total, { maximumFractionDigits: 2 })}
                    tone="destructive"
                />
                <Metric
                    label="Avances"
                    value={formatCurrency(report.advances_total, { maximumFractionDigits: 2 })}
                />
                <Metric
                    label="Commissions"
                    value={formatCurrency(report.commissions_total, { maximumFractionDigits: 2 })}
                />
                <Metric
                    label="Résultat net"
                    value={formatCurrency(report.net_result, { maximumFractionDigits: 2 })}
                    tone={report.net_result >= 0 ? 'success' : 'destructive'}
                />
                <Metric
                    label="Panier moyen"
                    value={formatCurrency(report.average_ticket, { maximumFractionDigits: 2 })}
                />
            </div>

            <p className="text-sm text-muted-foreground">
                {report.clients_count} client{report.clients_count > 1 ? 's' : ''} servi
                {report.clients_count > 1 ? 's' : ''} aujourd’hui.
            </p>

            {report.revenue_by_category.length > 0 && (
                <section>
                    <h4 className="text-sm font-semibold text-foreground">Par catégorie</h4>
                    <ul className="mt-3 space-y-2.5">
                        {report.revenue_by_category.map((row) => (
                            <li key={row.category}>
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="truncate text-foreground">
                                        {getCategoryLabel(row.category)}
                                        <span className="ml-1.5 text-xs text-muted-foreground">
                                            ({row.count})
                                        </span>
                                    </span>
                                    <span className="shrink-0 font-medium tabular-nums text-foreground">
                                        {formatCurrency(row.total, { maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{
                                            width: `${(row.total / categoryMax) * 100}%`,
                                        }}
                                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                        className="h-full rounded-full bg-accent/70"
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {report.revenue_by_employee.length > 0 && (
                <section>
                    <h4 className="text-sm font-semibold text-foreground">Par employé</h4>
                    <table className="mt-3 w-full text-sm">
                        <thead>
                            <tr className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                                <th className="pb-2 text-left font-medium">Employé</th>
                                <th className="pb-2 text-right font-medium">Tickets</th>
                                <th className="pb-2 text-right font-medium">CA</th>
                                <th className="pb-2 text-right font-medium">Commission</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.revenue_by_employee.map((row) => (
                                <tr
                                    key={row.employee_id}
                                    className="border-t border-white/[0.06] text-foreground"
                                >
                                    <td className="py-2 pr-3">{row.employee_name}</td>
                                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                                        {row.count}
                                    </td>
                                    <td className="py-2 text-right font-medium tabular-nums">
                                        {formatCurrency(row.total, { maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 text-right tabular-nums text-accent">
                                        {formatCurrency(row.commission, {
                                            maximumFractionDigits: 2,
                                        })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            {report.top_prestations.length > 0 && (
                <section>
                    <h4 className="text-sm font-semibold text-foreground">
                        Prestations les plus vendues
                    </h4>
                    <ol className="mt-3 space-y-2">
                        {report.top_prestations.map((prestation, index) => (
                            <li
                                key={`${prestation.label}-${index}`}
                                className="flex items-center justify-between gap-3 text-sm"
                            >
                                <span className="flex min-w-0 items-center gap-2.5">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[10px] font-semibold text-muted-foreground">
                                        {index + 1}
                                    </span>
                                    <span className="truncate text-foreground">
                                        {prestation.label}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        ×{prestation.count}
                                    </span>
                                </span>
                                <span className="shrink-0 font-medium tabular-nums text-foreground">
                                    {formatCurrency(prestation.total, { maximumFractionDigits: 2 })}
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </div>
    );
}

/**
 * Two-phase dialog: confirmation first, then the closing report returned by the
 * API. Dismissing after a successful close hands the page back to the
 * "Ouvrir la journée" state.
 */
export function CloseDayDialog({ open, onOpenChange, workDay, onClosed }: CloseDayDialogProps) {
    const refreshDay = useRefreshDay();

    const mutation = useMutation({
        mutationFn: () => closeWorkDay(workDay.id),
        onSuccess: () => refreshDay(),
    });

    const closed = mutation.data;

    function handleOpenChange(next: boolean) {
        if (!next && closed) {
            mutation.reset();
            onOpenChange(false);
            onClosed();
            return;
        }
        if (!next) mutation.reset();
        onOpenChange(next);
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {closed
                            ? `Journée du ${formatDayLabel(closed.date)} clôturée`
                            : 'Clôturer la journée ?'}
                    </DialogTitle>
                    <DialogDescription>
                        {closed
                            ? 'Récapitulatif définitif de la journée. Téléchargez le PDF pour vos archives.'
                            : 'Plus aucun encaissement ne pourra être enregistré sur cette journée. Le rapport de clôture sera généré immédiatement.'}
                    </DialogDescription>
                </DialogHeader>

                {closed?.closing_report ? (
                    <Report report={closed.closing_report} />
                ) : closed ? (
                    <p className="text-sm text-muted-foreground">
                        La journée est clôturée. Le rapport détaillé est disponible dans le PDF.
                    </p>
                ) : (
                    <>
                        <Separator />
                        <p className="text-sm text-muted-foreground">
                            {workDay.employees.filter((employee) => employee.present).length}{' '}
                            employé(s) en service · solde initial{' '}
                            {formatCurrency(workDay.opening_balance, { maximumFractionDigits: 2 })}.
                        </p>
                    </>
                )}

                {mutation.isError && (
                    <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                        <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-sm text-destructive">{getErrorMessage(mutation.error)}</p>
                    </div>
                )}

                <DialogFooter>
                    {closed ? (
                        <>
                            <Button variant="outline" onClick={() => handleOpenChange(false)}>
                                Fermer
                            </Button>
                            <Button
                                variant="accent"
                                onClick={() =>
                                    window.open(getWorkDayPdfUrl(closed.id), '_blank')
                                }
                            >
                                <Download />
                                Télécharger le PDF
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                                disabled={mutation.isPending}
                            >
                                Annuler
                            </Button>
                            <Button
                                variant="accent"
                                onClick={() => mutation.mutate()}
                                disabled={mutation.isPending}
                            >
                                {mutation.isPending ? <Loader2 className="animate-spin" /> : <Lock />}
                                {mutation.isPending ? 'Clôture…' : 'Clôturer'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
