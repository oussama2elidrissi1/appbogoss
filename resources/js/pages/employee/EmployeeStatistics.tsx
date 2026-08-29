import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Clock, Coins, Sparkles, Star, Users } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { getEmployeeStatistics } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency } from '@/lib/utils';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

const periods = [
    { label: '7 jours', value: '7d' },
    { label: 'Ce mois', value: 'month' },
    { label: '3 mois', value: '3m' },
    { label: '6 mois', value: '6m' },
    { label: 'Annee', value: 'year' },
];
const colors = ['#c8a24c', '#4ade80', '#60a5fa', '#f87171', '#a78bfa'];

export default function EmployeeStatistics() {
    const { t } = useI18n();
    const [period, setPeriod] = useState('month');
    const { data } = useQuery({
        queryKey: ['employee-workspace', 'statistics', period],
        queryFn: () => getEmployeeStatistics({ period, range: period }),
    });

    return (
        <EmployeePageShell>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold">{t('Mes statistiques')}</h2>
                    <p className="text-sm text-white/50">{t('Performance individuelle sur la periode choisie.')}</p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    {periods.map((item) => <Button key={item.value} variant={period === item.value ? 'accent' : 'outline'} onClick={() => setPeriod(item.value)}>{t(item.label)}</Button>)}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Stat icon={Sparkles} label={t('Prestations')} value={data?.kpis.prestations ?? 0} />
                <Stat icon={BarChart3} label={t('CA genere')} value={formatCurrency(data?.kpis.revenue ?? 0)} />
                <Stat icon={Coins} label={t('Pourboires')} value={formatCurrency(data?.kpis.tips ?? 0)} />
                <Stat icon={BarChart3} label={t('Commission generee')} value={formatCurrency(data?.kpis.commission_generated ?? 0)} />
                <Stat icon={BarChart3} label={t('Commission payee')} value={formatCurrency(data?.kpis.commission_paid ?? 0)} />
                <Stat icon={Star} label={t('Note moyenne')} value={data?.kpis.average_rating ?? '-'} />
                <Stat icon={Users} label={t('Clients servis')} value={data?.kpis.clients_served ?? 0} />
                <Stat icon={Clock} label={t('Duree moyenne')} value={t('{n} min', { n: data?.kpis.average_duration ?? 0 })} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <EmployeePanel>
                    <EmployeePanelTitle title={t('Evolution mensuelle')} icon={BarChart3} />
                    <div className="h-72 p-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.commission_evolution ?? []}>
                                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: 'rgba(255,255,255,.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ background: '#07101d', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: 'white' }} />
                                <Bar dataKey="amount" fill="#c8a24c" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </EmployeePanel>
                <EmployeePanel>
                    <EmployeePanelTitle title={t('Top services')} icon={Sparkles} />
                    <div className="space-y-2 p-4">
                        {data?.top_services.length === 0 ? <p className="py-8 text-center text-white/50">{t('Aucune donnee.')}</p> : data?.top_services.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.035] px-4 py-3">
                                <span className="min-w-0"><strong className="block truncate">{row.label}</strong><span className="text-sm text-white/45">{row.count} {t('prestations')}</span></span>
                                <span className="shrink-0 font-semibold text-[#d5b15d]">{formatCurrency(row.total)}</span>
                            </div>
                        ))}
                    </div>
                </EmployeePanel>
            </div>

            <EmployeePanel>
                <EmployeePanelTitle title={t('Repartition des prestations')} icon={Sparkles} />
                <div className="grid gap-4 p-4 md:grid-cols-[220px_1fr]">
                    <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart><Pie data={data?.service_distribution ?? []} dataKey="count" innerRadius={60} outerRadius={90}>{data?.service_distribution.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie></PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                        {data?.service_distribution.map((row, index) => (
                            <div key={row.label} className="flex justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.035] px-4 py-3">
                                <span className="min-w-0 truncate"><span style={{ backgroundColor: colors[index % colors.length] }} className="mr-2 inline-block h-2 w-2 rounded-full" />{row.label}</span>
                                <span className="shrink-0 text-white/55">{row.count} - {row.percent}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </EmployeePanel>
        </EmployeePageShell>
    );
}

function Stat({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string | number }) {
    return (
        <EmployeePanel className="p-4">
            <Icon className="h-5 w-5 text-[#d5b15d]" />
            <p className="mt-3 text-xs uppercase tracking-[0.12em] text-white/40">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
        </EmployeePanel>
    );
}
