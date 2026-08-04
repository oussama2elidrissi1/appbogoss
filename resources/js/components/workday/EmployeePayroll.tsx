import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, HandCoins } from 'lucide-react';
import { getCommissionPayoutHistory, getCommissionPayouts, getErrorMessage, payCommission } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
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
    const [period, setPeriod] = useState(currentMonth());
    const [confirmOpen, setConfirmOpen] = useState(false);

    const { data: rows, isPending } = useQuery({
        queryKey: ['commission-payouts', period, employee.id],
        queryFn: () => getCommissionPayouts(period, employee.id),
    });
    const row = rows?.[0];

    const { data: history, isPending: historyPending } = useQuery({
        queryKey: ['commission-payout-history', employee.id],
        queryFn: () => getCommissionPayoutHistory(employee.id),
    });

    const payMutation = useMutation({
        mutationFn: () => payCommission({ employee_id: employee.id, period }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['commission-payouts', period, employee.id] });
            void queryClient.invalidateQueries({ queryKey: ['commission-payout-history', employee.id] });
            void queryClient.invalidateQueries({ queryKey: ['advances', employee.id] });
            setConfirmOpen(false);
        },
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Commission &amp; paie
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
                                Commission
                            </p>
                            <p className="mt-1 text-sm font-semibold tabular-nums">
                                {formatCurrency(row.commission_total)}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Avances</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums text-accent">
                                {formatCurrency(row.advances_outstanding)}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                                Net à payer
                            </p>
                            <p className="mt-1 text-sm font-semibold tabular-nums">
                                {formatCurrency(row.already_paid ? (row.payout?.net_amount ?? 0) : row.net_amount)}
                            </p>
                        </div>
                    </div>

                    <div className="mt-3 flex justify-center">
                        {row.already_paid ? (
                            <Badge variant="success">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Payé{row.payout ? ` le ${formatDate(row.payout.paid_at)}` : ''}
                            </Badge>
                        ) : row.net_amount <= 0 ? (
                            <Badge variant="outline">Rien à payer</Badge>
                        ) : (
                            <Button type="button" variant="accent" size="sm" onClick={() => setConfirmOpen(true)}>
                                <HandCoins className="h-3.5 w-3.5" />
                                Marquer comme payé
                            </Button>
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
                        Historique des paiements
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
                title="Marquer cette commission comme payée ?"
                description={
                    row
                        ? `${formatCurrency(row.net_amount)} seront enregistrés comme payés à ${employee.name} pour ${period}` +
                          (row.advances_outstanding > 0
                              ? `, et ${formatCurrency(row.advances_outstanding)} d'avances en cours seront soldées automatiquement.`
                              : '.') +
                          ' Cette action ne peut pas être annulée depuis cette page.'
                        : undefined
                }
                confirmLabel="Marquer comme payé"
                variant="accent"
                loading={payMutation.isPending}
                onConfirm={() => payMutation.mutate()}
            />
        </div>
    );
}
