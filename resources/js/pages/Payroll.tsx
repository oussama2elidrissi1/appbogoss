import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ChevronDown, HandCoins, Loader2, Wallet } from 'lucide-react';
import { createAdvance, getCommissionPayouts, getEmployees, getErrorMessage, payCommission } from '@/lib/api';
import { useActiveWorkDay, workDayKeys } from '@/hooks/useWorkDay';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { CommissionPayoutRow } from '@/types/prestation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { EmployeeAdvances } from '@/components/workday/EmployeeAdvances';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';
import { pageFade } from '@/lib/motion';

function currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

export default function Payroll() {
    const queryClient = useQueryClient();
    const [period, setPeriod] = useState(currentMonth());
    const [confirming, setConfirming] = useState<CommissionPayoutRow | null>(null);
    // Whether "Marquer comme payé" also records the net amount as a cash-out
    // on the open caisse day — an advance created already settled and linked
    // to the payout, so nobody has to add + solder one by hand afterwards.
    const [deductFromCaisse, setDeductFromCaisse] = useState(true);
    const [expandedEmployeeId, setExpandedEmployeeId] = useState<number | null>(null);
    // Free-amount quick payment per row — lets a partial or ad-hoc payment be
    // logged as an advance (tied to today's caisse day, so it reduces the
    // register's cash like any other avance) without going through the
    // once-per-month "Marquer comme payé" settlement below.
    const [payAmounts, setPayAmounts] = useState<Record<number, string>>({});

    const {
        data: rows,
        isPending,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ['commission-payouts', period],
        queryFn: () => getCommissionPayouts(period),
    });

    // Needed to expand the "Avances" panel per row — Employee carries fields
    // (email, phone, account…) that CommissionPayoutRow doesn't. Must include
    // inactive employees: the payout list itself (CommissionPayoutController)
    // shows every employee regardless of is_active, so excluding them here
    // left the "Avances" panel stuck on its loading skeleton forever for
    // anyone no longer active but still owed/owing something.
    const { data: employees } = useQuery({
        queryKey: ['employees', 'all'],
        queryFn: () => getEmployees({ includeInactive: true }),
        staleTime: 5 * 60_000,
    });

    const { data: activeDay } = useActiveWorkDay();

    const payMutation = useMutation({
        mutationFn: (row: CommissionPayoutRow) =>
            payCommission({
                employee_id: row.employee_id,
                period,
                deduct_from_caisse: activeDay != null && deductFromCaisse,
            }),
        onSuccess: (_data, row) => {
            void queryClient.invalidateQueries({ queryKey: ['commission-payouts', period] });
            void queryClient.invalidateQueries({ queryKey: workDayKeys.advances(row.employee_id) });
            void queryClient.invalidateQueries({ queryKey: workDayKeys.all });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setConfirming(null);
        },
    });

    const payAdvanceMutation = useMutation({
        mutationFn: ({ employeeId, amount }: { employeeId: number; amount: number }) =>
            createAdvance({
                employee_id: employeeId,
                amount,
                given_on: today(),
                reason: 'Paiement commission',
            }),
        onSuccess: (_data, { employeeId }) => {
            void queryClient.invalidateQueries({ queryKey: ['commission-payouts', period] });
            void queryClient.invalidateQueries({ queryKey: workDayKeys.advances(employeeId) });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setPayAmounts((current) => {
                const next = { ...current };
                delete next[employeeId];
                return next;
            });
        },
    });

    const totals = (rows ?? []).reduce(
        (acc, row) => ({
            commission: acc.commission + row.commission_total,
            advances: acc.advances + row.advances_outstanding,
            net: acc.net + (row.already_paid ? 0 : row.net_amount),
            paidOut: acc.paidOut + (row.already_paid ? (row.payout?.net_amount ?? 0) : 0),
        }),
        { commission: 0, advances: 0, net: 0, paidOut: 0 },
    );

    return (
        <>
            <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Paie</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Commissions à payer chaque mois, déduction faite des avances sur salaire en cours.
                    </p>
                </div>

                <Card>
                    <CardContent className="flex flex-wrap items-end justify-between gap-4 p-4">
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Période
                            <input
                                type="month"
                                value={period}
                                onChange={(event) => setPeriod(event.target.value)}
                                className="block h-10 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors focus:border-accent/60"
                            />
                        </label>
                        <span className="text-sm text-muted-foreground">
                            Une avance est un acompte déjà versé sur la commission du mois — elle est
                            automatiquement soldée quand ce mois est marqué payé.
                        </span>
                    </CardContent>
                </Card>

                {!isPending && !isError && rows && rows.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Card className="p-4">
                            <p className="text-xs text-muted-foreground">Commissions du mois</p>
                            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(totals.commission)}</p>
                        </Card>
                        <Card className="p-4">
                            <p className="text-xs text-muted-foreground">Avances en cours</p>
                            <p className="mt-1 text-lg font-semibold tabular-nums text-accent">
                                {formatCurrency(totals.advances)}
                            </p>
                        </Card>
                        <Card className="p-4">
                            <p className="text-xs text-muted-foreground">Reste à payer</p>
                            <p className="mt-1 text-lg font-semibold tabular-nums text-accent">{formatCurrency(totals.net)}</p>
                        </Card>
                        <Card className="p-4">
                            <p className="text-xs text-muted-foreground">Déjà payé ce mois</p>
                            <p className="mt-1 text-lg font-semibold tabular-nums text-success">
                                {formatCurrency(totals.paidOut)}
                            </p>
                        </Card>
                    </div>
                )}

                {isPending ? (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton key={index} className="h-16 w-full rounded-md" />
                        ))}
                    </div>
                ) : isError ? (
                    <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                        <Button variant="accent" className="mt-4" onClick={() => void refetch()}>
                            Réessayer
                        </Button>
                    </Card>
                ) : !rows || rows.length === 0 ? (
                    <EmptyState
                        icon={Wallet}
                        title="Aucun employé"
                        description="Ajoutez des employés pour suivre leur commission mensuelle."
                    />
                ) : (
                    <div className="space-y-2">
                        {rows.map((row) => {
                            const isExpanded = expandedEmployeeId === row.employee_id;
                            const employee = employees?.find((candidate) => candidate.id === row.employee_id);

                            return (
                                <Card
                                    key={row.employee_id}
                                    className={cn(row.already_paid && 'opacity-80')}
                                >
                                    <div className="flex flex-wrap items-center gap-4 p-4">
                                        <EmployeeAvatar name={row.employee_name} color={row.avatar_color} />

                                        <div className="min-w-[10rem] flex-1">
                                            <p className="truncate text-sm font-semibold text-foreground">{row.employee_name}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                Commission {formatCurrency(row.commission_total)}
                                                {row.advances_outstanding > 0 && (
                                                    <span className="text-accent"> · avances {formatCurrency(row.advances_outstanding)}</span>
                                                )}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-sm font-semibold tabular-nums text-foreground">
                                                {formatCurrency(row.already_paid ? (row.payout?.net_amount ?? 0) : row.net_amount)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">net à payer</p>
                                        </div>

                                        {!row.already_paid && (
                                            <div className="flex shrink-0 flex-col gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        inputMode="decimal"
                                                        placeholder="Montant"
                                                        title="Montant payé maintenant — enregistré comme avance, déduit de la caisse du jour"
                                                        value={
                                                            payAmounts[row.employee_id] ??
                                                            (row.net_amount > 0 ? String(row.net_amount) : '')
                                                        }
                                                        onChange={(event) =>
                                                            setPayAmounts((current) => ({
                                                                ...current,
                                                                [row.employee_id]: event.target.value,
                                                            }))
                                                        }
                                                        className="h-9 w-24 tabular-nums"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={
                                                            payAdvanceMutation.isPending ||
                                                            !(
                                                                Number.parseFloat(
                                                                    (
                                                                        payAmounts[row.employee_id] ??
                                                                        (row.net_amount > 0 ? String(row.net_amount) : '')
                                                                    ).replace(',', '.'),
                                                                ) > 0
                                                            )
                                                        }
                                                        onClick={() => {
                                                            const raw =
                                                                payAmounts[row.employee_id] ??
                                                                (row.net_amount > 0 ? String(row.net_amount) : '');
                                                            const amount = Number.parseFloat(raw.replace(',', '.'));
                                                            if (!Number.isFinite(amount) || amount <= 0) return;
                                                            payAdvanceMutation.mutate({
                                                                employeeId: row.employee_id,
                                                                amount,
                                                            });
                                                        }}
                                                    >
                                                        {payAdvanceMutation.isPending &&
                                                        payAdvanceMutation.variables?.employeeId === row.employee_id ? (
                                                            <Loader2 className="animate-spin" />
                                                        ) : (
                                                            <HandCoins className="h-3.5 w-3.5" />
                                                        )}
                                                        Payer
                                                    </Button>
                                                </div>
                                                {payAdvanceMutation.isError &&
                                                    payAdvanceMutation.variables?.employeeId === row.employee_id && (
                                                        <p className="text-[11px] text-destructive">
                                                            {getErrorMessage(payAdvanceMutation.error)}
                                                        </p>
                                                    )}
                                            </div>
                                        )}

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0"
                                            onClick={() =>
                                                setExpandedEmployeeId(isExpanded ? null : row.employee_id)
                                            }
                                        >
                                            <HandCoins className="h-3.5 w-3.5" />
                                            Avances
                                            <ChevronDown
                                                className={cn(
                                                    'h-3.5 w-3.5 transition-transform duration-200',
                                                    isExpanded && 'rotate-180',
                                                )}
                                            />
                                        </Button>

                                        {row.already_paid ? (
                                            <Badge variant="success" className="shrink-0">
                                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                                Payé{row.payout ? ` le ${formatDate(row.payout.paid_at)}` : ''}
                                            </Badge>
                                        ) : row.net_amount <= 0 ? (
                                            <Badge variant="outline" className="shrink-0">
                                                Rien à payer
                                            </Badge>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="accent"
                                                size="sm"
                                                className="shrink-0"
                                                onClick={() => {
                                                    setDeductFromCaisse(true);
                                                    setConfirming(row);
                                                }}
                                            >
                                                <HandCoins className="h-3.5 w-3.5" />
                                                Marquer comme payé
                                            </Button>
                                        )}
                                    </div>

                                    {isExpanded && (
                                        <div className="border-t border-tint/[0.06] p-4">
                                            {employee ? (
                                                <EmployeeAdvances employee={employee} periodMonth={period} />
                                            ) : (
                                                <Skeleton className="h-24 w-full rounded-md" />
                                            )}
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                )}
            </motion.div>

            <ConfirmDialog
                open={confirming !== null}
                onOpenChange={(open) => {
                    if (!open) setConfirming(null);
                }}
                title="Marquer cette commission comme payée ?"
                description={
                    confirming
                        ? `${formatCurrency(confirming.net_amount)} seront enregistrés comme payés à ${confirming.employee_name} pour ${period}` +
                          (confirming.advances_outstanding > 0
                              ? `, et ${formatCurrency(confirming.advances_outstanding)} d'avances en cours seront soldées automatiquement.`
                              : '.') +
                          ' Cette action ne peut pas être annulée depuis cette page.'
                        : undefined
                }
                confirmLabel="Marquer comme payé"
                variant="accent"
                loading={payMutation.isPending}
                onConfirm={() => {
                    if (confirming) payMutation.mutate(confirming);
                }}
            >
                {activeDay != null && confirming !== null && confirming.net_amount > 0 && (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3 py-2.5">
                        <input
                            type="checkbox"
                            checked={deductFromCaisse}
                            onChange={(event) => setDeductFromCaisse(event.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
                        />
                        <span className="text-xs text-muted-foreground">
                            Sortir {formatCurrency(confirming.net_amount)} de la caisse du jour — enregistré
                            comme une avance déjà soldée, rattachée à cette paie. Décochez si l'argent ne sort
                            pas de la caisse (virement, autre source).
                        </span>
                    </label>
                )}
            </ConfirmDialog>

            {payMutation.isError && (
                <div className="fixed bottom-6 right-6 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3 shadow-soft-lg">
                    {payMutation.isPending ? (
                        <Loader2 className="mt-px h-3.5 w-3.5 shrink-0 animate-spin text-destructive" />
                    ) : (
                        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                    <p className="text-xs text-destructive">{getErrorMessage(payMutation.error)}</p>
                </div>
            )}
        </>
    );
}
