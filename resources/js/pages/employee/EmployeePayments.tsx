import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, HandCoins, ReceiptText, WalletCards, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getEmployeeWorkspaceCommissions } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

function currentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function EmployeePayments() {
    const { t, lang } = useI18n();
    const period = currentPeriod();
    const { data, isPending } = useQuery({
        queryKey: ['employee-workspace', 'payments'],
        queryFn: () => getEmployeeWorkspaceCommissions({ range: 'year' }),
    });

    const paymentData = useMemo(() => {
        const advances = data?.advances ?? [];
        const payouts = data?.payouts ?? [];
        const currentAdvances = advances.filter((advance) => advance.given_on?.startsWith(period));
        const previousAdvances = advances.filter((advance) => advance.given_on && !advance.given_on.startsWith(period));
        const currentPayouts = payouts.filter((payout) => payout.period === period);
        const movements = [
            ...advances.map((advance) => ({
                id: `advance-${advance.id}`,
                date: advance.given_on,
                title: advance.reason ?? t('Avance'),
                type: 'Avance',
                amount: advance.amount,
                status: advance.settled_at
                    ? advance.commission_payout_period
                        ? t('Reglee paie {period}', { period: advance.commission_payout_period })
                        : t('Reglee')
                    : t('En cours'),
                settled: Boolean(advance.settled_at),
            })),
            ...payouts.map((payout) => ({
                id: `payout-${payout.id}`,
                date: payout.paid_at,
                title: t('Paiement commission {period}', { period: payout.period }),
                type: 'Paiement',
                amount: payout.net_amount,
                status: payout.advances_deducted > 0
                    ? t('{amount} avances soldees', { amount: formatCurrency(payout.advances_deducted) })
                    : t('Net paye'),
                settled: true,
            })),
        ].sort((a, b) => new Date(b.date ?? '').getTime() - new Date(a.date ?? '').getTime());

        return {
            currentAdvances,
            previousAdvances,
            currentPayouts,
            movements,
            currentAdvancesTotal: currentAdvances.reduce((sum, advance) => sum + advance.amount, 0),
            currentOpenAdvances: currentAdvances.filter((advance) => !advance.settled_at).reduce((sum, advance) => sum + advance.amount, 0),
            previousOpenAdvances: previousAdvances.filter((advance) => !advance.settled_at).reduce((sum, advance) => sum + advance.amount, 0),
            currentNetPaid: currentPayouts.reduce((sum, payout) => sum + payout.net_amount, 0),
            currentCovered: currentPayouts.reduce((sum, payout) => sum + payout.net_amount + payout.advances_deducted, 0),
        };
    }, [data, period, t, lang]);

    const summary = data?.summary;
    const remaining = summary?.pending ?? 0;

    return (
        <EmployeePageShell>
            <div>
                <h2 className="text-2xl font-semibold">{t('Mes paiements')}</h2>
                <p className="text-sm text-white/50">{t('Mois actuel')} {period}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <PaymentStat icon={ReceiptText} label={t('Commission du mois')} value={formatCurrency(summary?.month ?? 0)} />
                <PaymentStat icon={CheckCircle2} label={t('Commission reglee')} value={formatCurrency(summary?.paid ?? 0)} />
                <PaymentStat icon={HandCoins} label={t('Avances du mois')} value={formatCurrency(paymentData.currentAdvancesTotal)} />
                <PaymentStat icon={Clock3} label={t('Avances reportees')} value={formatCurrency(paymentData.previousOpenAdvances)} />
                <PaymentStat icon={WalletCards} label={t('Reste net a payer')} value={formatCurrency(remaining)} highlight={remaining > 0} />
            </div>

            <EmployeePanel>
                <EmployeePanelTitle title={t('Solde du mois actuel')} icon={WalletCards} />
                <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
                    <PaymentFact label={t('Net paye ce mois')} value={formatCurrency(paymentData.currentNetPaid)} />
                    <PaymentFact label={t('Avances soldees ce mois')} value={formatCurrency(Math.max(0, paymentData.currentCovered - paymentData.currentNetPaid))} />
                    <PaymentFact label={t('Avances ouvertes du mois')} value={formatCurrency(paymentData.currentOpenAdvances)} />
                    <PaymentFact label={t('Reste net')} value={formatCurrency(remaining)} accent={remaining > 0} />
                </div>
            </EmployeePanel>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <EmployeePanel>
                    <EmployeePanelTitle title={t('Avances du mois actuel')} icon={HandCoins} />
                    <div className="max-h-[34rem] space-y-2 overflow-y-auto p-3">
                        {isPending ? (
                            <p className="py-10 text-center text-sm text-white/50">{t('Chargement...')}</p>
                        ) : paymentData.currentAdvances.length === 0 ? (
                            <p className="py-10 text-center text-sm text-white/50">{t('Aucune avance ce mois.')}</p>
                        ) : paymentData.currentAdvances.map((advance) => (
                            <AdvanceCard key={advance.id} advance={advance} />
                        ))}
                    </div>
                </EmployeePanel>

                <EmployeePanel>
                    <EmployeePanelTitle title={t('Paiements de commissions')} icon={WalletCards} />
                    <div className="max-h-[34rem] space-y-2 overflow-y-auto p-3">
                        {isPending ? (
                            <p className="py-10 text-center text-sm text-white/50">{t('Chargement...')}</p>
                        ) : data?.payouts.length === 0 ? (
                            <p className="py-10 text-center text-sm text-white/50">{t('Aucun paiement.')}</p>
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
                                    <PaymentFact label={t('Commission')} value={formatCurrency(payout.commission_total)} />
                                    <PaymentFact label={t('Avances soldees')} value={formatCurrency(payout.advances_deducted)} />
                                </div>
                            </div>
                        ))}
                    </div>
                </EmployeePanel>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <EmployeePanel>
                    <EmployeePanelTitle title={t('Anciennes avances reportees')} icon={Clock3} />
                    <div className="max-h-[28rem] space-y-2 overflow-y-auto p-3">
                        {isPending ? (
                            <p className="py-10 text-center text-sm text-white/50">{t('Chargement...')}</p>
                        ) : paymentData.previousAdvances.length === 0 ? (
                            <p className="py-10 text-center text-sm text-white/50">{t('Aucune ancienne avance.')}</p>
                        ) : paymentData.previousAdvances.map((advance) => (
                            <AdvanceCard key={advance.id} advance={advance} compact />
                        ))}
                    </div>
                </EmployeePanel>

                <EmployeePanel>
                    <EmployeePanelTitle title={t('Journal des mouvements')} icon={ReceiptText} />
                    <div className="max-h-[28rem] space-y-2 overflow-y-auto p-3">
                        {isPending ? (
                            <p className="py-10 text-center text-sm text-white/50">{t('Chargement...')}</p>
                        ) : paymentData.movements.length === 0 ? (
                            <p className="py-10 text-center text-sm text-white/50">{t('Aucun mouvement.')}</p>
                        ) : paymentData.movements.map((movement) => (
                            <div key={movement.id} className="rounded-md border border-white/[0.07] bg-white/[0.035] p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs text-white/42">{movement.date ? formatDate(movement.date) : '-'}</p>
                                        <p className="mt-1 truncate text-sm font-semibold text-white">{movement.title}</p>
                                        <p className="mt-1 text-xs text-white/45">{t(movement.type)}</p>
                                    </div>
                                    <p className={`shrink-0 text-sm font-semibold ${movement.type === 'Paiement' ? 'text-emerald-300' : 'text-[#d5b15d]'}`}>
                                        {formatCurrency(movement.amount)}
                                    </p>
                                </div>
                                <Badge className={`mt-3 ${movement.settled ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-[#c8a24c]/25 bg-[#c8a24c]/10 text-[#f0d27b]'}`}>
                                    {movement.status}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </EmployeePanel>
            </div>
        </EmployeePageShell>
    );
}

function AdvanceCard({ advance, compact = false }: {
    advance: {
        id: number;
        amount: number;
        reason: string | null;
        given_on: string | null;
        settled_at: string | null;
        commission_payout_period: string | null;
    };
    compact?: boolean;
}) {
    const { t } = useI18n();
    return (
        <div className="rounded-md border border-white/[0.07] bg-white/[0.035] p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs text-white/42">{advance.given_on ? formatDate(advance.given_on) : '-'}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{advance.reason ?? t('Avance')}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-[#d5b15d]">{formatCurrency(advance.amount)}</p>
            </div>
            {!compact && (
                <p className="mt-2 text-xs text-white/42">{t('Paiement recu en avance')}</p>
            )}
            <div className="mt-3">
                {advance.settled_at ? (
                    <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        {advance.commission_payout_period ? t('Reglee paie {period}', { period: advance.commission_payout_period }) : t('Reglee')}
                    </Badge>
                ) : (
                    <Badge className="border-[#c8a24c]/25 bg-[#c8a24c]/10 text-[#f0d27b]">{t('En cours')}</Badge>
                )}
            </div>
        </div>
    );
}

function PaymentStat({ icon: Icon, label, value, highlight = false }: { icon: LucideIcon; label: string; value: string; highlight?: boolean }) {
    return (
        <EmployeePanel className={`p-4 ${highlight ? 'border-[#c8a24c]/35 bg-[#c8a24c]/[0.075]' : ''}`}>
            <Icon className="h-5 w-5 text-[#d5b15d]" />
            <p className="mt-3 text-xs uppercase tracking-[0.12em] text-white/40">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
        </EmployeePanel>
    );
}

function PaymentFact({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="min-w-0 rounded-md border border-white/[0.06] bg-white/[0.035] px-2 py-2">
            <p className="truncate text-[10px] uppercase tracking-[0.08em] text-white/36">{label}</p>
            <p className={`mt-1 truncate font-semibold ${accent ? 'text-[#d5b15d]' : 'text-white/76'}`}>{value}</p>
        </div>
    );
}
