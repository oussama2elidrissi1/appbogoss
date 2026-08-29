import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, HandCoins, WalletCards } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEmployeeWorkspaceCommissions } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

const ranges = [
    { label: '7 jours', value: '7d' },
    { label: 'Ce mois', value: 'month' },
    { label: '3 mois', value: '3m' },
    { label: '6 mois', value: '6m' },
    { label: 'Annee', value: 'year' },
];

export default function EmployeeCommissions() {
    const { t } = useI18n();
    const [range, setRange] = useState('month');
    const { data, isPending } = useQuery({
        queryKey: ['employee-workspace', 'commissions', range],
        queryFn: () => getEmployeeWorkspaceCommissions({ range }),
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
    });

    return (
        <EmployeePageShell>
            <div>
                <h2 className="text-2xl font-semibold">{t('Mes commissions')}</h2>
                <p className="text-sm text-white/50">{t('Lecture seule, calculee depuis les prestations validees.')}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {data && Object.entries({
                    "Aujourd'hui": data.summary.today,
                    'Cette semaine': data.summary.week,
                    'Ce mois': data.summary.month,
                    Validee: data.summary.validated,
                    Payee: data.summary.paid,
                    'En attente': data.summary.pending,
                }).map(([label, value]) => (
                    <EmployeePanel key={label} className="p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-white/40">{t(label)}</p>
                        <p className="mt-3 text-xl font-semibold text-[#d5b15d]">{formatCurrency(value)}</p>
                    </EmployeePanel>
                ))}
            </div>

            {data && (data.summary.tips > 0 || data.summary.tips_commission > 0) && (
                <EmployeePanel className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.12em] text-white/40">
                                {t('Pourboires du mois')}
                            </p>
                            <p className="mt-2 text-xl font-semibold text-[#d5b15d]">
                                {formatCurrency(data.summary.tips)}
                            </p>
                        </div>
                        <p className="max-w-[46ch] text-sm text-white/58">
                            {t('Dont {x} pour vous (50% sur la coiffure), deja comptes dans vos commissions du mois.', {
                                x: formatCurrency(data.summary.tips_commission),
                            })}
                        </p>
                    </div>
                </EmployeePanel>
            )}

            <EmployeePanel>
                <EmployeePanelTitle title={t('Evolution de mes commissions')} icon={WalletCards} action={
                    <div className="flex flex-wrap gap-1">
                        {ranges.map((item) => <Button key={item.value} size="sm" variant={range === item.value ? 'accent' : 'ghost'} onClick={() => setRange(item.value)}>{t(item.label)}</Button>)}
                    </div>
                } />
                <div className="h-72 p-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data?.evolution ?? []}>
                            <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'rgba(255,255,255,.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: '#07101d', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: 'white' }} />
                            <Line type="monotone" dataKey="amount" stroke="#c8a24c" strokeWidth={3} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </EmployeePanel>

            <EmployeePanel>
                <EmployeePanelTitle title={t('Historique')} icon={HandCoins} />
                <div className="space-y-2 p-3 sm:hidden">
                    {isPending ? <p className="px-4 py-8 text-center text-white/50">{t('Chargement...')}</p> : data?.rows.length === 0 ? (
                        <p className="px-4 py-8 text-center text-white/50">{t('Aucune commission.')}</p>
                    ) : data?.rows.map((row) => (
                        <CommissionMobileCard key={row.id} row={row} />
                    ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[820px] text-sm">
                        <thead className="text-left text-xs uppercase tracking-[0.12em] text-white/38">
                            <tr>
                                <th className="px-4 py-3">{t('Date')}</th>
                                <th className="px-4 py-3">{t('Client')}</th>
                                <th className="px-4 py-3">{t('Service')}</th>
                                <th className="px-4 py-3 text-right">{t('Prix service')}</th>
                                <th className="px-4 py-3">{t('Type')}</th>
                                <th className="px-4 py-3 text-right">{t('Commission')}</th>
                                <th className="px-4 py-3 text-right">{t('Statut')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isPending ? <tr><td colSpan={7} className="px-4 py-8 text-center text-white/50">{t('Chargement...')}</td></tr> : data?.rows.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-white/50">{t('Aucune commission.')}</td></tr>
                            ) : data?.rows.map((row) => (
                                <tr key={row.id} className="border-t border-white/[0.06] text-white/72">
                                    <td className="px-4 py-3">{formatDate(row.date)}</td>
                                    <td className="px-4 py-3 font-medium text-white">{row.client_name}</td>
                                    <td className="px-4 py-3">{row.service_name}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(row.service_price)}</td>
                                    <td className="px-4 py-3">{t(commissionTypeLabel(row.type))}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-[#d5b15d]">{formatCurrency(row.amount)}</td>
                                    <td className="px-4 py-3 text-right"><Badge variant="outline">{row.status}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </EmployeePanel>

            <div className="grid gap-5 xl:grid-cols-2">
                <EmployeePanel>
                    <EmployeePanelTitle title={t('Historique des avances')} icon={HandCoins} />
                    <div className="max-h-[34rem] overflow-y-auto">
                        <div className="space-y-2 p-3 sm:hidden">
                            {isPending ? (
                                <p className="px-4 py-8 text-center text-white/50">{t('Chargement...')}</p>
                            ) : data?.advances.length === 0 ? (
                                <p className="px-4 py-8 text-center text-white/50">{t('Aucune avance en historique.')}</p>
                            ) : data?.advances.map((advance) => (
                                <div key={advance.id} className="rounded-md border border-white/[0.07] bg-white/[0.035] p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs text-white/42">{advance.given_on ? formatDate(advance.given_on) : '-'}</p>
                                            <p className="mt-1 truncate text-sm text-white/58">{advance.reason ?? '-'}</p>
                                        </div>
                                        <p className="shrink-0 text-sm font-semibold text-[#d5b15d]">{formatCurrency(advance.amount)}</p>
                                    </div>
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
                            ))}
                        </div>
                        <table className="hidden w-full min-w-[620px] text-sm sm:table">
                            <thead className="text-left text-xs uppercase tracking-[0.12em] text-white/38">
                                <tr>
                                    <th className="px-4 py-3">{t('Date')}</th>
                                    <th className="px-4 py-3 text-right">{t('Montant')}</th>
                                    <th className="px-4 py-3">{t('Motif')}</th>
                                    <th className="px-4 py-3 text-right">{t('Statut')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isPending ? (
                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-white/50">{t('Chargement...')}</td></tr>
                                ) : data?.advances.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-white/50">{t('Aucune avance en historique.')}</td></tr>
                                ) : data?.advances.map((advance) => (
                                    <tr key={advance.id} className="border-t border-white/[0.06] text-white/72">
                                        <td className="px-4 py-3">{advance.given_on ? formatDate(advance.given_on) : '-'}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-[#d5b15d]">{formatCurrency(advance.amount)}</td>
                                        <td className="px-4 py-3">{advance.reason ?? '-'}</td>
                                        <td className="px-4 py-3 text-right">
                                            {advance.settled_at ? (
                                                <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    {advance.commission_payout_period ? t('Reglee paie {period}', { period: advance.commission_payout_period }) : t('Reglee')}
                                                </Badge>
                                            ) : (
                                                <Badge className="border-[#c8a24c]/25 bg-[#c8a24c]/10 text-[#f0d27b]">{t('En cours')}</Badge>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </EmployeePanel>

                <EmployeePanel>
                    <EmployeePanelTitle title={t('Historique des paiements')} icon={WalletCards} />
                    <div className="max-h-[34rem] overflow-y-auto">
                        <div className="space-y-2 p-3 sm:hidden">
                            {isPending ? (
                                <p className="px-4 py-8 text-center text-white/50">{t('Chargement...')}</p>
                            ) : data?.payouts.length === 0 ? (
                                <p className="px-4 py-8 text-center text-white/50">{t('Aucun paiement de commission.')}</p>
                            ) : data?.payouts.map((payout) => (
                                <div key={payout.id} className="rounded-md border border-white/[0.07] bg-white/[0.035] p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium text-white">{payout.period}</p>
                                            {payout.paid_at && <p className="text-xs text-white/42">{formatDate(payout.paid_at)}</p>}
                                        </div>
                                        <p className="text-sm font-semibold text-emerald-300">{formatCurrency(payout.net_amount)}</p>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <MobileAmount label={t('Commission')} value={formatCurrency(payout.commission_total)} />
                                        <MobileAmount label={t('Avances soldees')} value={formatCurrency(payout.advances_deducted)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <table className="hidden w-full min-w-[620px] text-sm sm:table">
                            <thead className="text-left text-xs uppercase tracking-[0.12em] text-white/38">
                                <tr>
                                    <th className="px-4 py-3">{t('Periode')}</th>
                                    <th className="px-4 py-3 text-right">{t('Commission')}</th>
                                    <th className="px-4 py-3 text-right">{t('Avances soldees')}</th>
                                    <th className="px-4 py-3 text-right">{t('Net paye')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isPending ? (
                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-white/50">{t('Chargement...')}</td></tr>
                                ) : data?.payouts.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-white/50">{t('Aucun paiement de commission.')}</td></tr>
                                ) : data?.payouts.map((payout) => (
                                    <tr key={payout.id} className="border-t border-white/[0.06] text-white/72">
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-white">{payout.period}</span>
                                            {payout.paid_at && <span className="ml-2 text-xs text-white/42">{formatDate(payout.paid_at)}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right">{formatCurrency(payout.commission_total)}</td>
                                        <td className="px-4 py-3 text-right">{formatCurrency(payout.advances_deducted)}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-emerald-300">{formatCurrency(payout.net_amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </EmployeePanel>
            </div>
        </EmployeePageShell>
    );
}

/** Le type brut de la ligne ('tip_percentage'...) n'est pas lisible en caisse. */
function commissionTypeLabel(type: string): string {
    if (type === 'tip_percentage') return 'Pourboire 50%';
    if (type === 'percentage') return 'Pourcentage';
    if (type === 'fixed') return 'Montant fixe';
    if (type === 'none') return 'Aucune';
    return type;
}

function CommissionMobileCard({ row }: { row: {
    id: number;
    date: string;
    client_name: string;
    service_name: string;
    service_price: number;
    type: string;
    amount: number;
    status: string;
} }) {
    const { t } = useI18n();
    return (
        <div className="rounded-md border border-white/[0.07] bg-white/[0.035] p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs text-white/42">{formatDate(row.date)}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{row.client_name}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-white/58">{row.service_name}</p>
                </div>
                <Badge variant="outline" className="shrink-0">{row.status}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MobileAmount label={t('Prix')} value={formatCurrency(row.service_price)} />
                <MobileAmount label={t('Type')} value={t(commissionTypeLabel(row.type))} />
                <MobileAmount label={t('Commission')} value={formatCurrency(row.amount)} accent />
            </div>
        </div>
    );
}

function MobileAmount({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="min-w-0 rounded-md border border-white/[0.06] bg-white/[0.035] px-2 py-2">
            <p className="truncate text-[10px] uppercase tracking-[0.08em] text-white/36">{label}</p>
            <p className={`mt-1 truncate font-semibold ${accent ? 'text-[#d5b15d]' : 'text-white/76'}`}>{value}</p>
        </div>
    );
}
