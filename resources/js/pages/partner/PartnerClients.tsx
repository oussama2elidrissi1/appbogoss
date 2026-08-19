import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, CalendarPlus, Eye, Search, Users } from 'lucide-react';
import { getErrorMessage, getPartnerPortalClients } from '@/lib/api';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';

export default function PartnerClients() {
    const [search, setSearch] = useState('');

    const { data, isPending, isError, error, refetch } = useQuery({
        queryKey: ['partner-portal', 'clients', 'list', search],
        queryFn: () => getPartnerPortalClients(search || undefined),
    });

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Mes clients</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Votre portefeuille privé — visible uniquement par vous et BOGOSLAND.
                </p>
            </div>

            <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher un client..."
                    className="pl-10"
                />
            </div>

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
            ) : !data || data.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="Aucun client"
                    description="Les clients que vous apportez apparaîtront ici."
                />
            ) : (
                <div className="space-y-2">
                    {data.map((client) => (
                        <Card key={client.id} className="flex flex-wrap items-center gap-4 p-4">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint/[0.06] text-sm font-semibold text-accent ring-1 ring-tint/10">
                                {getInitials(client.name)}
                            </span>

                            <div className="min-w-[10rem] flex-1">
                                <p className="truncate text-sm font-semibold">{client.name}</p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {client.phone ?? 'Aucun téléphone'}
                                    {client.created_at ? ` · Ajouté le ${formatDate(client.created_at)}` : ''}
                                </p>
                            </div>

                            <div className="hidden text-center sm:block">
                                <p className="text-sm font-semibold tabular-nums">{client.reservations_count}</p>
                                <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Résa.</p>
                            </div>

                            <div className="hidden text-center sm:block">
                                <p className="text-sm font-semibold tabular-nums">{formatCurrency(client.revenue_generated)}</p>
                                <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">CA généré</p>
                            </div>

                            <div className="hidden text-center sm:block">
                                <p className="text-sm font-semibold tabular-nums text-accent">
                                    {formatCurrency(client.commission_generated, { maximumFractionDigits: 2 })}
                                </p>
                                <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Commission</p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                                <Button variant="outline" size="sm" asChild>
                                    <Link to={`/partner/clients/${client.id}`}>
                                        <Eye className="h-3.5 w-3.5" />
                                        Voir
                                    </Link>
                                </Button>
                                <Button variant="accent" size="sm" asChild>
                                    <Link to="/partner/reservations/new">
                                        <CalendarPlus className="h-3.5 w-3.5" />
                                        Réserver
                                    </Link>
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
