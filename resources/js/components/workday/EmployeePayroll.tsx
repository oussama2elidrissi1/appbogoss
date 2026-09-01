import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, HandCoins } from 'lucide-react';
import { getCommissionPayoutHistory, getCommissionPayouts, getErrorMessage, payCommission } from '@/lib/api';
import { useActiveWorkDay, workDayKeys } from '@/hooks/useWorkDay';
import { PaymentSourceNotice } from '@/components/workday/PaymentSourceNotice';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';

function currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** This employee's monthly commission payout — earned vs. avances en cours, and history of past payments. */
export function EmployeePayroll({ employee }: { employee: Employee }) {
    const queryClient = useQueryClient();
    const { t } = useI18n();
    const [period, setPeriod] = useState(currentMonth());
    const [confirmOpen, setConfirmOpen] = useState(false);
    // Same option as on the "Paie" page — record the net amount as a
    // cash-out (settled advance) on the open caisse day.
    const [deductFromCaisse, setDeductFromCaisse] = useState(true);

    const { data: activeDay } = useActiveWorkDay();

    const { data: rows, isPending } = useQuery({
        queryKey: ['commission-payouts', period, employee.id],
        queryFn: () => getCommissionPayouts(period, employee.id),
    });
    const row = rows?.[0];

    const { data: history, isPending: historyPending } = useQuery({
        queryKey: ['commission-payout-history', employee.id],
        queryFn: () => getCommissionPayoutHistory(employee.id),
    });

    // Commission not yet covered by this period's payouts — an employee paid
    // mid-month can earn more afterwards. Mirrors the "Paie" page.
    const commissionRemaining =
        row != null
            ? row.commission_total -
              row.paid_net_total -
              row.paid_advances_total -
              row.paid_from_wallet
            : 0;
    // Remaining commission fully handed over as advances — net is 0 but the
    // month still must be markable as paid so those advances get settled
    // instead of rolling into next month's payout.
    const fullyAdvanced =
        row != null &&
        commissionRemaining > 0 &&
        Math.abs(row.advances_outstanding - commissionRemaining) < 0.005;
    const payable = row != null && (row.net_amount > 0 || fullyAdvanced);

    const payMutation = useMutation({
        mutationFn: () =>
            payCommission({
                employee_id: employee.id,
                period,
                deduct_from_caisse: activeDay != null && deductFromCaisse,
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['commission-payouts', period, employee.id] });
            void queryClient.invalidateQueries({ queryKey: ['commission-payout-history', employee.id] });
            void queryClient.invalidateQueries({ queryKey: ['advances', employee.id] });
            void queryClient.invalidateQueries({ queryKey: workDayKeys.all });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setConfirmOpen(false);
        },
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {t('Commission & paie')}
                </p>
                <input
                    type="month"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value)}
                    className="h-8 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-2.5 text-xs text-foreground outline-none transition-colors focus:border-accent/60"
                />
            </div>

            {isPending || !row ? (
                <Skeleton className="h-24 w-full rounded-md" />
            ) : (
                <div className="rounded-md border border-tint/[0.06] bg-tint/[0.02] p-3.5">
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                                {t('Commission')}
                            </p>
                            <p className="mt-1 text-sm font-semibold tabular-nums">
                                {formatCurrency(row.commission_total)}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{t('Avances')}</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums text-accent">
                                {formatCurrency(row.advances_outstanding)}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                                {t(row.already_paid && row.net_amount <= 0 ? 'Payé ce mois' : 'Net à payer')}
                            </p>
                            <p
                                className={cn(
                                    'mt-1 text-sm font-semibold tabular-nums',
                                    row.already_paid && row.net_amount <= 0 && 'text-success',
                                )}
                            >
                                {formatCurrency(
                                    row.already_paid && row.net_amount <= 0
                                        ? row.paid_net_total + row.paid_advances_total
                                        : row.net_amount,
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        {payable ? (
                            <>
                                {row.already_paid && (
                                    <Badge variant="success">
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        {row.payout ? t('Payé le {date}', { date: formatDate(row.payout.paid_at) }) : t('Payé')}
                                    </Badge>
                                )}
                                <Button
                                    type="button"
                                    variant="accent"
                                    size="sm"
                                    onClick={() => {
                                        setDeductFromCaisse(true);
                                        setConfirmOpen(true);
                                    }}
                                >
                                    <HandCoins className="h-3.5 w-3.5" />
                                    {t(row.already_paid ? 'Payer le reste' : 'Marquer comme payé')}
                                </Button>
                            </>
                        ) : row.already_paid ? (
                            <Badge variant="success">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                {row.payout ? t('Payé le {date}', { date: formatDate(row.payout.paid_at) }) : t('Payé')}
                            </Badge>
                        ) : (
                            <Badge variant="outline">{t('Rien à payer')}</Badge>
                        )}
                    </div>

                    {payMutation.isError && (
                        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3 py-2">
                            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
                            <p className="text-xs text-destructive">{getErrorMessage(payMutation.error)}</p>
                        </div>
                    )}
                </div>
            )}

            {!historyPending && history && history.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                        {t('Historique des paiements')}
                    </p>
                    <ul className="space-y-1.5">
                        {history.map((payout) => (
                            <li
                                key={payout.id}
                                className="flex items-center justify-between gap-2 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2 text-xs"
                            >
                                <span className="text-muted-foreground">
                                    {payout.period} · {formatDate(payout.paid_at)}
                                    {payout.paid_by ? ` · ${payout.paid_by}` : ''}
                                </span>
                                <span className="font-medium tabular-nums text-success">
                                    {formatCurrency(payout.net_amount)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={t('Marquer cette commission comme payée ?')}
                description={
                    row
                        ? (row.net_amount <= 0
                              ? t(
                                    "La commission restante de {name} ({remaining}) a déjà été entièrement versée en avances — les {advances} d'avances seront soldées et {period} sera marqué payé (0 MAD à verser).",
                                    {
                                        name: employee.name,
                                        remaining: formatCurrency(commissionRemaining),
                                        advances: formatCurrency(row.advances_outstanding),
                                        period,
                                    },
                                )
                              : t('{amount} seront enregistrés comme payés à {name} pour {period}', {
                                    amount: formatCurrency(row.net_amount),
                                    name: employee.name,
                                    period,
                                }) +
                                (row.advances_outstanding > 0
                                    ? t(", et {advances} d'avances en cours seront soldées automatiquement.", {
                                          advances: formatCurrency(row.advances_outstanding),
                                      })
                                    : '.')) +
                          ' ' +
                          t('Cette action ne peut pas être annulée depuis cette page.')
                        : undefined
                }
                confirmLabel={t('Marquer comme payé')}
                variant="accent"
                loading={payMutation.isPending}
                onConfirm={() => payMutation.mutate()}
            >
                {row != null && row.net_amount > 0 && (
                    <PaymentSourceNotice
                        className="mb-3"
                        source={activeDay != null && deductFromCaisse ? 'caisse' : 'none'}
                        detail={
                            activeDay == null
                                ? "Aucune journée de caisse ouverte : ce versement sera enregistré sans sortie de caisse. Pour tracer l'argent réellement remis, utilisez « Mon portefeuille → Payer un employé »."
                                : deductFromCaisse
                                  ? 'Cette opération réduira le résultat de caisse de la journée ouverte.'
                                  : "Le mois sera marqué payé sans qu'aucune sortie d'argent ne soit enregistrée. Pour tracer la remise, utilisez « Mon portefeuille → Payer un employé »."
                        }
                    />
                )}

                {activeDay != null && row != null && row.net_amount > 0 && (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3 py-2.5">
                        <input
                            type="checkbox"
                            checked={deductFromCaisse}
                            onChange={(event) => setDeductFromCaisse(event.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
                        />
                        <span className="text-xs text-muted-foreground">
                            {t(
                                "Sortir {amount} de la caisse du jour — enregistré comme une avance déjà soldée, rattachée à cette paie. Décochez si l'argent ne sort pas de la caisse (virement, autre source).",
                                { amount: formatCurrency(row.net_amount) },
                            )}
                        </span>
                    </label>
                )}
            </ConfirmDialog>
        </div>
    );
}
