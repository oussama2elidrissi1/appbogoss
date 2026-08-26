import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Archive, ArchiveRestore, CalendarPlus, Eye, Loader2, Plus, Search, Users } from 'lucide-react';
import {
    archivePartnerClient,
    createClient,
    getErrorMessage,
    getPartnerPortalClients,
    unarchivePartnerClient,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';
import type { PartnerClientRow } from '@/types/partner-portal';

const FILTERS = [
    { value: 'active' as const, label: 'Actifs' },
    { value: 'archived' as const, label: 'Archivés' },
];

export default function PartnerClients() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'active' | 'archived'>('active');
    const [creating, setCreating] = useState(false);
    const [archiveTarget, setArchiveTarget] = useState<PartnerClientRow | null>(null);

    const { data, isPending, isError, error, refetch } = useQuery({
        queryKey: ['partner-portal', 'clients', 'list', search, filter],
        queryFn: () => getPartnerPortalClients(search || undefined, filter),
    });

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['partner-portal', 'clients'] });
    }

    const archiveMutation = useMutation({
        mutationFn: (client: PartnerClientRow) =>
            client.archived_at ? unarchivePartnerClient(client.id) : archivePartnerClient(client.id),
        onSuccess: () => {
            invalidate();
            setArchiveTarget(null);
        },
    });

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{t('Mes clients')}</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {t('Votre portefeuille privé — visible uniquement par vous et BOGOSLAND.')}
                    </p>
                </div>
                <Button type="button" variant="accent" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" />
                    {t('Nouveau client')}
                </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative max-w-sm flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('Rechercher un client...')}
                        className="pl-10"
                    />
                </div>
                <div className="flex items-center gap-1 rounded-md border border-tint/[0.08] bg-tint/[0.03] p-1">
                    {FILTERS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setFilter(option.value)}
                            className={cn(
                                'rounded-sm px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                                filter === option.value
                                    ? 'bg-accent text-accent-foreground shadow-soft'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t(option.label)}
                        </button>
                    ))}
                </div>
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
                        {t('Réessayer')}
                    </Button>
                </Card>
            ) : !data || data.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title={filter === 'archived' ? t('Aucun client archivé') : t('Aucun client')}
                    description={
                        filter === 'archived'
                            ? t('Les clients archivés apparaîtront ici.')
                            : t('Les clients que vous apportez apparaîtront ici.')
                    }
                />
            ) : (
                <div className="space-y-2">
                    {data.map((client) => (
                        <Card key={client.id} className={cn('flex flex-wrap items-center gap-4 p-4', client.archived_at && 'opacity-60')}>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint/[0.06] text-sm font-semibold text-accent ring-1 ring-tint/10">
                                {getInitials(client.name)}
                            </span>

                            <div className="min-w-[10rem] flex-1">
                                <p className="truncate text-sm font-semibold">{client.name}</p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {client.phone ?? t('Aucun téléphone')}
                                    {client.created_at ? ` · ${t('Ajouté le {date}', { date: formatDate(client.created_at) })}` : ''}
                                </p>
                            </div>

                            <div className="hidden text-center sm:block">
                                <p className="text-sm font-semibold tabular-nums">{client.reservations_count}</p>
                                <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{t('Résa.')}</p>
                            </div>

                            <div className="hidden text-center sm:block">
                                <p className="text-sm font-semibold tabular-nums">{formatCurrency(client.revenue_generated)}</p>
                                <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{t('CA généré')}</p>
                            </div>

                            <div className="hidden text-center sm:block">
                                <p className="text-sm font-semibold tabular-nums text-accent">
                                    {formatCurrency(client.commission_generated, { maximumFractionDigits: 2 })}
                                </p>
                                <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{t('Commission')}</p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                                <Button variant="outline" size="sm" asChild>
                                    <Link to={`/partner/clients/${client.id}`}>
                                        <Eye className="h-3.5 w-3.5" />
                                        {t('Voir')}
                                    </Link>
                                </Button>
                                {!client.archived_at && (
                                    <Button variant="accent" size="sm" asChild>
                                        <Link to="/partner/reservations/new">
                                            <CalendarPlus className="h-3.5 w-3.5" />
                                            {t('Réserver')}
                                        </Link>
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={client.archived_at ? t('Désarchiver') : t('Archiver')}
                                    onClick={() => setArchiveTarget(client)}
                                >
                                    {client.archived_at ? (
                                        <ArchiveRestore className="h-3.5 w-3.5" />
                                    ) : (
                                        <Archive className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <NewClientDialog open={creating} onOpenChange={setCreating} onCreated={invalidate} />

            <ConfirmDialog
                open={archiveTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setArchiveTarget(null);
                }}
                title={archiveTarget?.archived_at ? t('Désarchiver ce client ?') : t('Archiver ce client ?')}
                description={
                    archiveTarget?.archived_at
                        ? t('{name} réapparaîtra dans votre liste active.', { name: archiveTarget?.name ?? '' })
                        : t("{name} n'apparaîtra plus dans votre liste active — son historique est conservé.", { name: archiveTarget?.name ?? '' })
                }
                confirmLabel={archiveTarget?.archived_at ? t('Désarchiver') : t('Archiver')}
                variant={archiveTarget?.archived_at ? 'accent' : 'destructive'}
                loading={archiveMutation.isPending}
                onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)}
            />
        </motion.div>
    );
}

function NewClientDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    const { t } = useI18n();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    const mutation = useMutation({
        mutationFn: () => createClient({ name: name.trim(), phone: phone.trim() || null, email: email.trim() || null }),
        onSuccess: () => {
            onCreated();
            onOpenChange(false);
            setName('');
            setPhone('');
            setEmail('');
        },
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{t('Nouveau client')}</DialogTitle>
                    <DialogDescription>{t('Il sera ajouté à votre portefeuille, visible uniquement par vous et BOGOSLAND.')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="new-client-name-list">{t('Nom')}</Label>
                        <Input id="new-client-name-list" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Nom du client')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="new-client-phone-list">{t('Téléphone')}</Label>
                        <Input id="new-client-phone-list" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="06 00 00 00 00" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="new-client-email-list">{t('Email (facultatif)')}</Label>
                        <Input id="new-client-email-list" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="client@email.com" />
                    </div>
                    {mutation.isError && <p className="text-xs text-destructive">{getErrorMessage(mutation.error)}</p>}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Annuler')}
                    </Button>
                    <Button type="button" variant="accent" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
                        {mutation.isPending && <Loader2 className="animate-spin" />}
                        {t('Ajouter')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
