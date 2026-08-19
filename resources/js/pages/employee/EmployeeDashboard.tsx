import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    Clock3,
    HandCoins,
    MessageSquareText,
    ReceiptText,
    Sparkles,
    Star,
    TrendingUp,
    WalletCards,
} from 'lucide-react';
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getEmployeeWorkspaceDashboard } from '@/lib/api';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import type { EmployeePrestationRow } from '@/types/employee-workspace';
import type { PrestationStatus } from '@/types/prestation';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

const statusMeta: Record<PrestationStatus | string, { label: string; className: string }> = {
    draft: { label: 'A venir', className: 'border-sky-400/25 bg-sky-400/10 text-sky-200' },
    in_progress: { label: 'En cours', className: 'border-yellow-400/25 bg-yellow-400/10 text-yellow-200' },
    services_done: { label: 'Terminee', className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' },
    pending_payment: { label: 'Caisse', className: 'border-[#c8a24c]/30 bg-[#c8a24c]/10 text-[#f2d47c]' },
    paid: { label: 'Terminee', className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' },
    cancelled: { label: 'Annulee', className: 'border-red-400/25 bg-red-400/10 text-red-200' },
    refunded: { label: 'Remboursee', className: 'border-red-400/25 bg-red-400/10 text-red-200' },
};

const donutColors = ['#c8a24c', '#4ade80', '#60a5fa', '#f87171', '#a78bfa', '#fbbf24'];

export default function EmployeeDashboard() {
    const { data, isPending } = useQuery({
        queryKey: ['employee-workspace', 'dashboard'],
        queryFn: getEmployeeWorkspaceDashboard,
    });

    if (isPending) {
        return (
            <EmployeePageShell>
                <div className="grid gap-3 md:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-md bg-white/10" />)}
                </div>
                <Skeleton className="h-96 rounded-md bg-white/10" />
            </EmployeePageShell>
        );
    }

    if (!data) return null;

    const totalDistribution = data.service_distribution.reduce((sum, row) => sum + row.count, 0);

    return (
        <EmployeePageShell>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Kpi icon={ReceiptText} label="Prestations aujourd'hui" value={data.today.prestations_count} hint={`${data.today.prestations_delta >= 0 ? '+' : ''}${data.today.prestations_delta} vs hier`} />
                <Kpi icon={TrendingUp} label="Chiffre d'affaires" value={formatCurrency(data.today.revenue)} hint="Prestations payees" />
                <Kpi icon={HandCoins} label="Commission du jour" value={formatCurrency(data.today.commission)} hint="Validee" />
                <Kpi icon={WalletCards} label="Commission du mois" value={formatCurrency(data.today.monthly_commission)} hint="Mois courant" />
                <Kpi icon={CheckCircle2} label="Commission payee" value={formatCurrency(data.today.paid_commission)} hint="Mois courant" />
            </div>

            {data.next_appointment && (
                <EmployeePanel className="border-[#c8a24c]/22 bg-[#c8a24c]/[0.075] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d5b15d]">Prochain client</p>
                            <h2 className="mt-1 text-xl font-semibold">{data.next_appointment.client_name}</h2>
                            <p className="text-sm text-white/62">
                                {formatTime(data.next_appointment.starts_at)} - {data.next_appointment.service}
                            </p>
                        </div>
                        <Link to="/employee/agenda" className="inline-flex items-center gap-2 rounded-md bg-[#c8a24c] px-4 py-2 text-sm font-semibold text-[#07101d]">
                            Ouvrir l'agenda
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </EmployeePanel>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.75fr)]">
                <EmployeePanel>
                    <EmployeePanelTitle title="Mes prestations aujourd'hui" icon={ReceiptText} action={<Link to="/employee/prestations" className="text-xs font-semibold text-[#d5b15d]">Voir toutes <ArrowRight className="inline h-3 w-3" /></Link>} />
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="text-left text-xs uppercase tracking-[0.12em] text-white/38">
                                <tr>
                                    <th className="px-4 py-3">Client</th>
                                    <th className="px-4 py-3">Prestation</th>
                                    <th className="px-4 py-3">Heure</th>
                                    <th className="px-4 py-3 text-right">Montant</th>
                                    <th className="px-4 py-3 text-right">Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.prestations_today.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-10 text-center text-white/48">Aucune prestation creee aujourd'hui.</td></tr>
                                ) : data.prestations_today.map((row) => <PrestationLine key={row.id} row={row} />)}
                            </tbody>
                        </table>
                    </div>
                </EmployeePanel>

                <EmployeePanel>
                    <EmployeePanelTitle title="Mon agenda" icon={CalendarDays} action={<Link to="/employee/agenda" className="text-xs font-semibold text-[#d5b15d]">Complet <ArrowRight className="inline h-3 w-3" /></Link>} />
                    <div className="max-h-[430px] space-y-1 overflow-y-auto p-4">
                        {data.agenda_today.length === 0 ? (
                            <p className="py-10 text-center text-sm text-white/48">Aucun rendez-vous aujourd'hui.</p>
                        ) : data.agenda_today.map((item) => (
                            <div key={item.id} className="relative grid grid-cols-[54px_1fr] gap-3 rounded-md px-2 py-2.5 hover:bg-white/[0.045]">
                                <span className="text-sm font-semibold tabular-nums text-[#d5b15d]">{formatTime(item.starts_at)}</span>
                                <span className="absolute bottom-2 left-[66px] top-2 w-px bg-white/[0.08]" />
                                <span className="relative min-w-0 pl-4">
                                    <span className="absolute left-[-3px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#c8a24c] ring-4 ring-[#07101d]" />
                                    <span className="block truncate text-sm font-medium">{item.client_name}</span>
                                    <span className="block truncate text-xs text-white/50">{item.service}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </EmployeePanel>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
                <EmployeePanel className="xl:col-span-2">
                    <EmployeePanelTitle title="Evolution de mes commissions" icon={TrendingUp} />
                    <div className="h-72 p-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.commission_evolution}>
                                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: 'rgba(255,255,255,.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ background: '#07101d', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: 'white' }} />
                                <Line type="monotone" dataKey="amount" stroke="#c8a24c" strokeWidth={3} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </EmployeePanel>

                <EmployeePanel>
                    <EmployeePanelTitle title="Repartition de mes prestations" icon={Sparkles} />
                    <div className="grid gap-2 p-4 sm:grid-cols-[150px_1fr] xl:grid-cols-1">
                        <div className="relative h-40">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.service_distribution} dataKey="count" innerRadius={48} outerRadius={70} paddingAngle={2}>
                                        {data.service_distribution.map((_, index) => <Cell key={index} fill={donutColors[index % donutColors.length]} />)}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-bold">{totalDistribution}</span>
                                <span className="text-[11px] text-white/45">Prestations</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {data.service_distribution.map((row, index) => (
                                <div key={row.label} className="flex items-center justify-between gap-2 text-sm">
                                    <span className="min-w-0 truncate"><span style={{ backgroundColor: donutColors[index % donutColors.length] }} className="mr-2 inline-block h-2 w-2 rounded-full" />{row.label}</span>
                                    <span className="shrink-0 text-white/55">{row.count} - {row.percent}%</span>
                                </div>
                            ))}
                            {data.service_distribution.length === 0 && <p className="py-8 text-center text-sm text-white/48">Aucune donnee.</p>}
                        </div>
                    </div>
                </EmployeePanel>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                <EmployeePanel>
                    <EmployeePanelTitle title="Avis clients" icon={Star} action={<Link to="/employee/reviews" className="text-xs font-semibold text-[#d5b15d]">Voir tous <ArrowRight className="inline h-3 w-3" /></Link>} />
                    <div className="p-4">
                        {data.reviews.count === 0 ? (
                            <p className="rounded-md border border-white/[0.06] bg-white/[0.035] px-4 py-8 text-center text-sm text-white/50">
                                Vous n'avez pas encore recu d'avis.
                            </p>
                        ) : (
                            <div>
                                <p className="text-4xl font-bold">{data.reviews.average} <span className="text-base text-white/45">/ 5</span></p>
                                <p className="mt-1 text-sm text-[#d5b15d]">{'★'.repeat(Math.round(data.reviews.average ?? 0))}</p>
                                <p className="text-sm text-white/50">Base sur {data.reviews.count} avis</p>
                                {data.reviews.latest && (
                                    <blockquote className="mt-4 rounded-md border border-white/[0.06] bg-white/[0.035] p-4 text-sm text-white/78">
                                        <strong>{data.reviews.latest.client_name}</strong>
                                        <p className="mt-1">{data.reviews.latest.comment}</p>
                                    </blockquote>
                                )}
                            </div>
                        )}
                    </div>
                </EmployeePanel>
                <EmployeePanel>
                    <EmployeePanelTitle title="Conseil du jour" icon={MessageSquareText} />
                    <div className="p-5">
                        <p className="text-lg leading-relaxed text-white/78">{data.daily_tip}</p>
                    </div>
                </EmployeePanel>
            </div>
        </EmployeePageShell>
    );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof ReceiptText; label: string; value: string | number; hint: string }) {
    return (
        <EmployeePanel className="p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/42">{label}</p>
                    <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
                    <p className="mt-1 text-xs text-white/45">{hint}</p>
                </div>
                <span className="rounded-md border border-[#c8a24c]/25 bg-[#c8a24c]/12 p-2.5 text-[#d5b15d]">
                    <Icon className="h-5 w-5" />
                </span>
            </div>
        </EmployeePanel>
    );
}

function PrestationLine({ row }: { row: EmployeePrestationRow }) {
    const meta = statusMeta[row.status] ?? statusMeta.draft;
    return (
        <tr className="border-t border-white/[0.06] text-white/78">
            <td className="px-4 py-3 font-medium text-white">{row.client_name}</td>
            <td className="max-w-[260px] truncate px-4 py-3">{row.service}</td>
            <td className="px-4 py-3 tabular-nums"><Clock3 className="mr-1 inline h-3.5 w-3.5 text-white/35" />{row.time}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(row.amount)}</td>
            <td className="px-4 py-3 text-right"><Badge className={cn('justify-center', meta.className)}>{meta.label}</Badge></td>
        </tr>
    );
}
