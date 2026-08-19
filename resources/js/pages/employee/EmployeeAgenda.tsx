import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock3, Phone, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getEmployeeAgenda } from '@/lib/api';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import type { EmployeeAgendaRow } from '@/types/employee-workspace';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

const views = ['today', 'day', 'week', 'month', 'list'] as const;

export default function EmployeeAgenda() {
    const [view, setView] = useState<(typeof views)[number]>('today');
    const [selected, setSelected] = useState<EmployeeAgendaRow | null>(null);
    const { data = [], isPending } = useQuery({
        queryKey: ['employee-workspace', 'agenda', view],
        queryFn: () => getEmployeeAgenda({ view }),
    });

    return (
        <EmployeePageShell>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold">Mon agenda</h2>
                    <p className="text-sm text-white/50">Uniquement vos rendez-vous affectes.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {views.map((item) => <Button key={item} variant={view === item ? 'accent' : 'outline'} onClick={() => setView(item)}>{label(item)}</Button>)}
                </div>
            </div>

            <EmployeePanel>
                <EmployeePanelTitle title="Planning" icon={CalendarDays} />
                <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {isPending ? <p className="text-white/50">Chargement...</p> : data.length === 0 ? (
                        <p className="col-span-full py-10 text-center text-white/50">Aucun rendez-vous sur cette periode.</p>
                    ) : data.map((item) => (
                        <button key={item.id} type="button" onClick={() => setSelected(item)} className="rounded-md border border-white/[0.07] bg-white/[0.035] p-4 text-left transition hover:border-[#c8a24c]/40 hover:bg-[#c8a24c]/[0.07]">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-[#d5b15d]">{formatTime(item.starts_at)}</p>
                                    <p className="mt-1 font-semibold">{item.client_name}</p>
                                    <p className="mt-1 text-sm text-white/55">{item.service}</p>
                                </div>
                                <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-xs text-white/55">{item.status}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </EmployeePanel>

            <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
                <DialogContent className="border-white/[0.08] bg-[#07101d] text-white">
                    {selected && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Detail du rendez-vous</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="rounded-md border border-white/[0.07] bg-white/[0.04] p-4">
                                    <p className="flex items-center gap-2 text-lg font-semibold"><UserRound className="h-4 w-4 text-[#d5b15d]" />{selected.client_name}</p>
                                    {selected.client_phone && <p className="mt-1 flex items-center gap-2 text-sm text-white/55"><Phone className="h-3.5 w-3.5" />{selected.client_phone}</p>}
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Fact label="Date" value={formatDate(selected.starts_at)} />
                                    <Fact label="Heure" value={`${formatTime(selected.starts_at)} - ${formatTime(selected.ends_at)}`} />
                                    <Fact label="Duree" value={`${selected.duration_minutes} min`} />
                                    <Fact label="Montant" value={formatCurrency(selected.amount)} />
                                    <Fact label="Statut" value={selected.status} />
                                    <Fact label="Origine" value={selected.origin} />
                                </div>
                                <div className="rounded-md border border-white/[0.07] bg-white/[0.04] p-4">
                                    <p className="text-xs uppercase tracking-[0.14em] text-white/38">Prestation(s)</p>
                                    <p className="mt-1 font-medium">{selected.service}</p>
                                </div>
                                {selected.notes && <div className="rounded-md border border-white/[0.07] bg-white/[0.04] p-4 text-sm text-white/70">{selected.notes}</div>}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </EmployeePageShell>
    );
}

function Fact({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md border border-white/[0.07] bg-white/[0.04] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/38">{label}</p>
            <p className="mt-1 font-semibold"><Clock3 className="mr-1 inline h-3.5 w-3.5 text-[#d5b15d]" />{value}</p>
        </div>
    );
}

function label(view: string) {
    return { today: "Aujourd'hui", day: 'Jour', week: 'Semaine', month: 'Mois', list: 'Liste' }[view] ?? view;
}
