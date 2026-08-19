import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, HandCoins, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getEmployeeWorkspaceCommissions } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

export default function EmployeePayments() {
    const { data, isPending } = useQuery({
        queryKey: ['employee-workspace', 'payments'],
        queryFn: () => getEmployeeWorkspaceCommissions({ range: 'year' }),
    });

    const totals = useMemo(() => {
        const advances = data?.advances ?? [];
        const payouts = data?.payouts ?? [];

        return {
            advancesOpen: advances.filter((advance) => !advance.settled_at).reduce((sum, advance) => sum + advance.amount, 0),
            advancesTotal: advances.reduce((sum, advance) => sum + advance.amount, 0),
            payoutsNet: payouts.reduce((sum, payout) => sum + payout.net_amount, 0),
            payoutsCovered: payouts.reduce((sum, payout) => sum + payout.net_amount + payout.advances_deducted, 0),
        };
    }, [data]);

    return (
        <EmployeePageShell>
            <div>
                <h2 className="text-2xl font-semibold">Mes paiements</h2>
                <p className="text-sm text-white/50">Avances et paiements de commissions.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <PaymentStat icon={HandCoins} label="Avances en cours" value={formatCurrency(totals.advancesOpen)} />
                <PaymentStat icon={HandCoins} label="Total avances" value={formatCurrency(totals.advancesTotal)} />
                <PaymentStat icon={WalletCards} label="Net paye" value={formatCurrency(totals.payoutsNet)} />
                <PaymentStat icon={CheckCircle2} label="Commission reglee" value={formatCurrency(totals.payoutsCovered)} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <EmployeePanel>
                    <EmployeePanelTitle title="Carte avances" icon={HandCoins} />
                    <div className="max-h-[38rem] space-y-2 overflow-y-auto p-3">
                        {isPending ? (
                            <p className="py-10 text-center text-sm text-white/50">Chargement...</p>
                        ) : data?.advances.length === 0 ? (
                            <p className="py-10 text-center text-sm text-white/50">Aucune avance.</p>
                        ) : data?.advances.map((advance) => (
                            <div key={advance.id} className="rounded-md border border-white/[0.07] bg-white/[0.035] p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs text-white/42">{advance.given_on ? formatDate(advance.given_on) : '-'}</p>
                                        <p className="mt-1 truncate text-sm text-white/58">{advance.reason ?? 'Avance'}</p>
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold text-[#d5b15d]">{formatCurrency(advance.amount)}</p>
                                </div>
                                <div className="mt-3">
                                    {advance.settled_at ? (
                                        <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Reglee{advance.commission_payout_period ? ` paie ${advance.commission_payout_period}` : ''}
                                        </Badge>
                                    ) : (
                                        <Badge className="border-[#c8a24c]/25 bg-[#c8a24c]/10 text-[#f0d27b]">En cours</Badge>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </EmployeePanel>

                <EmployeePanel>
                    <EmployeePanelTitle title="Carte paiements" icon={WalletCards} />
                    <div className="max-h-[38rem] space-y-2 overflow-y-auto p-3">
                        {isPending ? (
                            <p className="py-10 text-center text-sm text-white/50">Chargement...</p>
                        ) : data?.payouts.length === 0 ? (
                            <p className="py-10 text-center text-sm text-white/50">Aucun paiement.</p>
                        ) : data?.payouts.map((payout) => (
                            <div key={payout.id} className="rounded-md border border-white/[0.07] bg-white/[0.035] p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-medium text-white">{payout.period}</p>
                                        {payout.paid_at && <p className="text-xs text-white/42">{formatDate(payout.paid_at)}</p>}
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold text-emerald-300">{formatCurrency(payout.net_amount)}</p>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                    <PaymentFact label="Commission" value={formatCurrency(payout.commission_total)} />
                                    <PaymentFact label="Avances soldees" value={formatCurrency(payout.advances_deducted)} />
                                </div>
                            </div>
                        ))}
                    </div>
                </EmployeePanel>
            </div>
        </EmployeePageShell>
    );
}

function PaymentStat({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string }) {
    return (
        <EmployeePanel className="p-4">
            <Icon className="h-5 w-5 text-[#d5b15d]" />
            <p className="mt-3 text-xs uppercase tracking-[0.12em] text-white/40">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
        </EmployeePanel>
    );
}

function PaymentFact({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-md border border-white/[0.06] bg-white/[0.035] px-2 py-2">
            <p className="truncate text-[10px] uppercase tracking-[0.08em] text-white/36">{label}</p>
            <p className="mt-1 truncate font-semibold text-white/76">{value}</p>
        </div>
    );
}
