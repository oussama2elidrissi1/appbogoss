import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Archive, ArchiveRestore, ArrowLeft, CalendarPlus, History, Receipt } from 'lucide-react';
import { archivePartnerClient, getErrorMessage, getPartnerPortalClient, unarchivePartnerClient } from '@/lib/api';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { pageFade } from '@/lib/motion';

const STATUS_LABEL: Record<string, string> = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    completed: 'Terminée',
    cancelled: 'Annulée',
    no_show: 'Absent(e)',
    refused: 'Refusée',
};

export default function PartnerClientDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const clientId = Number(id);
    const [confirmingArchive, setConfirmingArchive] = useState(false);

    const { data: client, isPending, isError, error } = useQuery({
        queryKey: ['partner-portal', 'client', clientId],
        queryFn: () => getPartnerPortalClient(clientId),
        enabled: Number.isFinite(clientId),
    });

    const archiveMutation = useMutation({
        mutationFn: () =>
            client?.archived_at ? unarchivePartnerClient(clientId) : archivePartnerClient(clientId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['partner-portal', 'client', clientId] });
            void queryClient.invalidateQueries({ queryKey: ['partner-portal', 'clients'] });
            setConfirmingArchive(false);
        },
    });

    if (isPending) {
        return (
            <div className="mx-auto max-w-2xl space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-48 w-full rounded-md" />
            </div>
        );
    }

    if (isError || !client) {
        return (
            <Card className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-12 text-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="mt-2 text-sm text-destructive">{error ? getErrorMessage(error) : 'Client introuvable.'}</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/partner/clients')}>
                    Retour à mes clients
                </Button>
            </Card>
        );
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="mx-auto max-w-2xl space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate('/partner/clients')} aria-label="Retour">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="flex-1 text-xl font-semibold tracking-tight">Fiche client</h1>
                {client.archived_at && <Badge variant="outline">Archivé</Badge>}
            </div>

            <Card className="p-5 sm:p-6">
                <div className="flex items-center gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/[0.14] text-lg font-semibold text-accent ring-1 ring-accent/25">
                        {getInitials(client.name)}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-lg font-semibold">{client.name}</p>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {client.phone ?? 'Aucun téléphone'}
                            {client.email ? ` · ${client.email}` : ''}
                        </p>
                        {client.created_at && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Client depuis le {formatDate(client.created_at)}
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                    {!client.archived_at && (
                        <Button variant="accent" asChild>
                            <Link to="/partner/reservations/new">
                                <CalendarPlus className="h-4 w-4" />
                                Nouvelle réservation
                            </Link>
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => setConfirmingArchive(true)}>
                        {client.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                        {client.archived_at ? 'Désarchiver' : 'Archiver'}
                    </Button>
                </div>
            </Card>

            <Card className="p-5 sm:p-6">
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Activité avec vous
                </h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-md border border-tint/[0.06] bg-tint/[0.02] p-3 text-center">
                        <p className="text-lg font-semibold tabular-nums">{client.reservations_count}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                            Réservations
                        </p>
                    </div>
                    <div className="rounded-md border border-tint/[0.06] bg-tint/[0.02] p-3 text-center">
                        <p className="text-lg font-semibold tabular-nums">{formatCurrency(client.revenue_generated)}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">CA généré</p>
                    </div>
                    <div className="rounded-md border border-tint/[0.06] bg-tint/[0.02] p-3 text-center">
                        <p className="text-lg font-semibold tabular-nums text-accent">
                            {formatCurrency(client.commission_generated, { maximumFractionDigits: 2 })}
                        </p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                            Commission générée
                        </p>
                    </div>
                </div>
                {client.last_reservation_at && (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Dernière réservation le {formatDate(client.last_reservation_at)}
                    </p>
                )}
            </Card>

            <Card className="p-5 sm:p-6">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <History className="h-3.5 w-3.5" />
                    Historique des réservations
                </h2>
                {client.reservations.length === 0 ? (
                    <p className="mt-4 rounded-md border border-dashed border-tint/[0.1] px-3 py-6 text-center text-xs text-muted-foreground">
                        Aucune réservation avec ce client pour le moment.
                    </p>
                ) : (
                    <ul className="mt-3 space-y-1.5">
                        {client.reservations.map((reservation) => (
                            <li
                                key={reservation.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2.5 text-sm"
                            >
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <Receipt className="h-3.5 w-3.5" />
                                    {reservation.service_name ?? 'Service'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {reservation.starts_at ? formatDate(reservation.starts_at) : ''}
                                </span>
                                <Badge
                                    variant={
                                        reservation.status === 'cancelled' ||
                                        reservation.status === 'no_show' ||
                                        reservation.status === 'refused'
                                            ? 'destructive'
                                            : reservation.status === 'completed'
                                              ? 'success'
                                              : 'outline'
                                    }
                                >
                                    {STATUS_LABEL[reservation.status] ?? reservation.status}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <ConfirmDialog
                open={confirmingArchive}
                onOpenChange={setConfirmingArchive}
                title={client.archived_at ? 'Désarchiver ce client ?' : 'Archiver ce client ?'}
                description={
                    client.archived_at
                        ? `${client.name} réapparaîtra dans votre liste active.`
                        : `${client.name} n'apparaîtra plus dans votre liste active — son historique est conservé.`
                }
                confirmLabel={client.archived_at ? 'Désarchiver' : 'Archiver'}
                variant={client.archived_at ? 'accent' : 'destructive'}
                loading={archiveMutation.isPending}
                onConfirm={() => archiveMutation.mutate()}
            />
        </motion.div>
    );
}
