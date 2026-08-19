import { useQuery } from '@tanstack/react-query';
import { Phone, UsersRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getEmployeeClients } from '@/lib/api';
import { formatDate, getInitials } from '@/lib/utils';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

export default function EmployeeClients() {
    const { data = [], isPending } = useQuery({
        queryKey: ['employee-workspace', 'clients'],
        queryFn: getEmployeeClients,
    });

    return (
        <EmployeePageShell>
            <div>
                <h2 className="text-2xl font-semibold">Mes clients</h2>
                <p className="text-sm text-white/50">Clients que vous avez reellement servis.</p>
            </div>
            <EmployeePanel>
                <EmployeePanelTitle title="Clients servis" icon={UsersRound} />
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {isPending ? <p className="text-white/50">Chargement...</p> : data.length === 0 ? (
                        <p className="col-span-full py-10 text-center text-white/50">Aucun client servi pour le moment.</p>
                    ) : data.map((client) => (
                        <div key={client.id} className="rounded-md border border-white/[0.07] bg-white/[0.035] p-4">
                            <div className="flex items-center gap-3">
                                <Avatar>
                                    <AvatarFallback style={{ backgroundColor: client.avatar_color ?? '#c8a24c' }} className="text-[#07101d]">
                                        {getInitials(client.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="truncate font-semibold">{client.name}</p>
                                    {client.phone && <p className="flex items-center gap-1 text-xs text-white/50"><Phone className="h-3 w-3" />{client.phone}</p>}
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                                <Fact label="Prestations" value={client.prestations_count} />
                                <Fact label="Derniere visite" value={client.last_visit_at ? formatDate(client.last_visit_at) : '-'} />
                            </div>
                            {client.usual_services.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {client.usual_services.map((service) => (
                                        <span key={service.label} className="rounded-full border border-[#c8a24c]/25 bg-[#c8a24c]/10 px-2 py-0.5 text-xs text-[#f0d27b]">
                                            {service.label} x{service.count}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {client.notes && <p className="mt-3 line-clamp-2 text-xs text-white/48">{client.notes}</p>}
                        </div>
                    ))}
                </div>
            </EmployeePanel>
        </EmployeePageShell>
    );
}

function Fact({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md border border-white/[0.06] bg-white/[0.035] p-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/38">{label}</p>
            <p className="mt-1 font-semibold">{value}</p>
        </div>
    );
}

