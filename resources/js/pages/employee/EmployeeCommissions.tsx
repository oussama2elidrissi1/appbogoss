import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HandCoins, WalletCards } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEmployeeWorkspaceCommissions } from '@/lib/api';
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
    const [range, setRange] = useState('month');
    const { data, isPending } = useQuery({
        queryKey: ['employee-workspace', 'commissions', range],
        queryFn: () => getEmployeeWorkspaceCommissions({ range }),
    });

    return (
        <EmployeePageShell>
            <div>
                <h2 className="text-2xl font-semibold">Mes commissions</h2>
                <p className="text-sm text-white/50">Lecture seule, calculee depuis les prestations validees.</p>
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
                        <p className="text-xs uppercase tracking-[0.12em] text-white/40">{label}</p>
                        <p className="mt-3 text-xl font-semibold text-[#d5b15d]">{formatCurrency(value)}</p>
                    </EmployeePanel>
                ))}
            </div>

            <EmployeePanel>
                <EmployeePanelTitle title="Evolution de mes commissions" icon={WalletCards} action={
                    <div className="flex flex-wrap gap-1">
                        {ranges.map((item) => <Button key={item.value} size="sm" variant={range === item.value ? 'accent' : 'ghost'} onClick={() => setRange(item.value)}>{item.label}</Button>)}
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
                <EmployeePanelTitle title="Historique" icon={HandCoins} />
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                        <thead className="text-left text-xs uppercase tracking-[0.12em] text-white/38">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Client</th>
                                <th className="px-4 py-3">Service</th>
                                <th className="px-4 py-3 text-right">Prix service</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3 text-right">Commission</th>
                                <th className="px-4 py-3 text-right">Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isPending ? <tr><td colSpan={7} className="px-4 py-8 text-center text-white/50">Chargement...</td></tr> : data?.rows.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-white/50">Aucune commission.</td></tr>
                            ) : data?.rows.map((row) => (
                                <tr key={row.id} className="border-t border-white/[0.06] text-white/72">
                                    <td className="px-4 py-3">{formatDate(row.date)}</td>
                                    <td className="px-4 py-3 font-medium text-white">{row.client_name}</td>
                                    <td className="px-4 py-3">{row.service_name}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(row.service_price)}</td>
                                    <td className="px-4 py-3">{row.type}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-[#d5b15d]">{formatCurrency(row.amount)}</td>
                                    <td className="px-4 py-3 text-right"><Badge variant="outline">{row.status}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </EmployeePanel>
        </EmployeePageShell>
    );
}

