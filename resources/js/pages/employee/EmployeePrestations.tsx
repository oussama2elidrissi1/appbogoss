import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Search, Send, TimerReset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    completePrestationServices,
    getEmployeePrestations,
    getErrorMessage,
    sendPrestationToCaisse,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import type { EmployeePrestationRow } from '@/types/employee-workspace';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';
import { NewPrestationPanel } from '@/components/prestations/NewPrestationPanel';

const filters = [
    { label: "Aujourd'hui", days: 0 },
    { label: 'Cette semaine', days: 6 },
    { label: 'Ce mois', days: 30 },
];

function isoDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

export default function EmployeePrestations() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [range, setRange] = useState(0);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');

    const period = useMemo(() => {
        const to = new Date();
        const from = new Date();
        from.setDate(to.getDate() - range);
        return { from: isoDate(from), to: isoDate(to) };
    }, [range]);

    const { data = [], isPending, isError, error } = useQuery({
        queryKey: ['employee-workspace', 'prestations', period, status, search],
        queryFn: () => getEmployeePrestations({ ...period, status: status || undefined, search: search || undefined }),
    });

    const completeMutation = useMutation({
        mutationFn: completePrestationServices,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employee-workspace'] }),
    });
    const sendMutation = useMutation({
        mutationFn: sendPrestationToCaisse,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employee-workspace'] }),
    });

    return (
        <EmployeePageShell>
            <div>
                <h2 className="text-2xl font-semibold">{t('Mes prestations')}</h2>
                <p className="text-sm text-white/50">{t('Suivi de vos services, montants et commissions.')}</p>
            </div>

            <EmployeePanel className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex flex-wrap gap-2">
                        {filters.map((item) => (
                            <Button key={item.label} type="button" variant={range === item.days ? 'accent' : 'outline'} onClick={() => setRange(item.days)}>
                                {t(item.label)}
                            </Button>
                        ))}
                    </div>
                    <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="h-10 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white"
                    >
                        <option value="">{t('Tous statuts')}</option>
                        <option value="draft">{t('A venir')}</option>
                        <option value="in_progress">{t('En cours')}</option>
                        <option value="services_done">{t('Terminee')}</option>
                        <option value="pending_payment">{t('Caisse')}</option>
                        <option value="paid">{t('Payee')}</option>
                        <option value="cancelled">{t('Annulee')}</option>
                    </select>
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Recherche client')} className="border-white/[0.08] bg-white/[0.04] pl-9 text-white" />
                    </div>
                </div>
            </EmployeePanel>

            <EmployeePanel className="p-4">
                <EmployeePanelTitle title={t('Nouvelle prestation')} icon={CheckCircle2} />
                <div className="pt-4">
                    <NewPrestationPanel />
                </div>
            </EmployeePanel>

            <EmployeePanel>
                <EmployeePanelTitle title={t('Historique des prestations')} icon={TimerReset} />
                {isError && <p className="p-4 text-sm text-red-300">{getErrorMessage(error)}</p>}
                <div className="space-y-2 p-3 sm:hidden">
                    {isPending ? (
                        <p className="px-4 py-10 text-center text-white/50">{t('Chargement...')}</p>
                    ) : data.length === 0 ? (
                        <p className="px-4 py-10 text-center text-white/50">{t('Aucune prestation sur cette periode.')}</p>
                    ) : data.map((row) => (
                        <PrestationMobileCard
                            key={row.id}
                            row={row}
                            completing={completeMutation.isPending}
                            sending={sendMutation.isPending}
                            onComplete={() => completeMutation.mutate(row.id)}
                            onSend={() => sendMutation.mutate(row.id)}
                        />
                    ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[900px] text-sm">
                        <thead className="text-left text-xs uppercase tracking-[0.12em] text-white/38">
                            <tr>
                                <th className="px-4 py-3">{t('Date')}</th>
                                <th className="px-4 py-3">{t('Heure')}</th>
                                <th className="px-4 py-3">{t('Client')}</th>
                                <th className="px-4 py-3">{t('Service')}</th>
                                <th className="px-4 py-3 text-right">{t('Duree')}</th>
                                <th className="px-4 py-3 text-right">{t('Montant')}</th>
                                <th className="px-4 py-3 text-right">{t('Commission')}</th>
                                <th className="px-4 py-3 text-right">{t('Statut')}</th>
                                <th className="px-4 py-3 text-right">{t('Action')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isPending ? (
                                <tr><td colSpan={9} className="px-4 py-10 text-center text-white/50">{t('Chargement...')}</td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan={9} className="px-4 py-10 text-center text-white/50">{t('Aucune prestation sur cette periode.')}</td></tr>
                            ) : data.map((row) => (
                                <PrestationRow
                                    key={row.id}
                                    row={row}
                                    completing={completeMutation.isPending}
                                    sending={sendMutation.isPending}
                                    onComplete={() => completeMutation.mutate(row.id)}
                                    onSend={() => sendMutation.mutate(row.id)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </EmployeePanel>
        </EmployeePageShell>
    );
}

function PrestationRow({ row, onComplete, onSend, completing, sending }: {
    row: EmployeePrestationRow;
    onComplete: () => void;
    onSend: () => void;
    completing: boolean;
    sending: boolean;
}) {
    const { t } = useI18n();
    return (
        <tr className="border-t border-white/[0.06] text-white/76">
            <td className="px-4 py-3">{formatDate(row.date)}</td>
            <td className="px-4 py-3">{formatTime(row.date)}</td>
            <td className="px-4 py-3 font-medium text-white">{row.client_name}</td>
            <td className="max-w-[260px] truncate px-4 py-3">{row.service}</td>
            <td className="px-4 py-3 text-right">{t('{n} min', { n: row.duration_minutes })}</td>
            <td className="px-4 py-3 text-right font-semibold">{formatCurrency(row.amount)}</td>
            <td className="px-4 py-3 text-right text-[#d5b15d]">
                {formatCurrency(row.commission)}
                {row.tips > 0 && (
                    <span className="block text-[11px] text-white/50">
                        {t('+ {x} de pourboire', { x: formatCurrency(row.tips) })}
                    </span>
                )}
            </td>
            <td className="px-4 py-3 text-right"><Badge variant="outline">{t(statusLabel(row.status))}</Badge></td>
            <td className="px-4 py-3 text-right">
                {row.status === 'in_progress' && (
                    <Button size="sm" variant="accent" disabled={completing} onClick={onComplete}>
                        {completing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        {t('Terminer')}
                    </Button>
                )}
                {row.status === 'services_done' && (
                    <Button size="sm" variant="outline" disabled={sending} onClick={onSend}>
                        {sending ? <Loader2 className="animate-spin" /> : <Send />}
                        {t('Envoyer caisse')}
                    </Button>
                )}
            </td>
        </tr>
    );
}

function PrestationMobileCard({ row, onComplete, onSend, completing, sending }: {
    row: EmployeePrestationRow;
    onComplete: () => void;
    onSend: () => void;
    completing: boolean;
    sending: boolean;
}) {
    const { t } = useI18n();
    return (
        <div className="rounded-md border border-white/[0.07] bg-white/[0.035] p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs text-white/42">{formatDate(row.date)} - {formatTime(row.date)}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{row.client_name}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-white/58">{row.service}</p>
                </div>
                <Badge variant="outline" className="shrink-0">{t(statusLabel(row.status))}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MobileFact label={t('Duree')} value={t('{n} min', { n: row.duration_minutes })} />
                <MobileFact label={t('Montant')} value={formatCurrency(row.amount)} />
                <MobileFact label={t('Commission')} value={formatCurrency(row.commission)} accent />
                {row.tips > 0 && <MobileFact label={t('Pourboire')} value={formatCurrency(row.tips)} />}
            </div>
            {(row.status === 'in_progress' || row.status === 'services_done') && (
                <div className="mt-3 flex justify-end">
                    {row.status === 'in_progress' && (
                        <Button size="sm" variant="accent" disabled={completing} onClick={onComplete}>
                            {completing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                            {t('Terminer')}
                        </Button>
                    )}
                    {row.status === 'services_done' && (
                        <Button size="sm" variant="outline" disabled={sending} onClick={onSend}>
                            {sending ? <Loader2 className="animate-spin" /> : <Send />}
                            {t('Envoyer caisse')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

function MobileFact({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="min-w-0 rounded-md border border-white/[0.06] bg-white/[0.035] px-2 py-2">
            <p className="truncate text-[10px] uppercase tracking-[0.08em] text-white/36">{label}</p>
            <p className={`mt-1 truncate font-semibold ${accent ? 'text-[#d5b15d]' : 'text-white/76'}`}>{value}</p>
        </div>
    );
}

function statusLabel(status: string) {
    return {
        draft: 'A venir',
        in_progress: 'En cours',
        services_done: 'Terminee',
        pending_payment: 'En caisse',
        paid: 'Payee',
        cancelled: 'Annulee',
        refunded: 'Remboursee',
    }[status] ?? status;
}
