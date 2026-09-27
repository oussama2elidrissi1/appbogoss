import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, CalendarClock, ChevronLeft, ChevronRight, ExternalLink, Globe, Phone, Search } from 'lucide-react';
import { getErrorMessage, getSiteReservations } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';
import type { SiteReservation, SiteReservationStatus } from '@/types/site-reservation';

/** Où confirmer / terminer une réservation : l'admin du plugin sur le site. */
const WP_ADMIN_URL = 'https://bogosland.com/wp-admin/admin.php?page=bgl-res-appointments';

const STATUS_TABS: Array<{ value: SiteReservationStatus | 'all'; label: string }> = [
    { value: 'all', label: 'Toutes' },
    { value: 'pending', label: 'En attente' },
    { value: 'confirmed', label: 'Confirmées' },
    { value: 'completed', label: 'Terminées' },
    { value: 'cancelled', label: 'Annulées' },
];

const STATUS_BADGE: Record<SiteReservationStatus, { label: string; variant: 'accent' | 'success' | 'default' | 'destructive' }> = {
    pending: { label: 'En attente', variant: 'accent' },
    confirmed: { label: 'Confirmée', variant: 'success' },
    completed: { label: 'Terminée', variant: 'default' },
    cancelled: { label: 'Annulée', variant: 'destructive' },
};

/** "2026-10-01" → "01/10/2026", sans passer par Date (pas de décalage de fuseau). */
function formatWallDate(value: string): string {
    const [year, month, day] = value.slice(0, 10).split('-');
    return day && month && year ? `${day}/${month}/${year}` : value;
}

/** "2026-09-26 09:31:25" → "26/09/2026 09:31". */
function formatWallDateTime(value: string): string {
    return `${formatWallDate(value)} ${value.slice(11, 16)}`.trim();
}

/** Réservations prises sur bogosland.com (plugin WordPress), en lecture seule. */
export default function SiteReservations() {
    const { t } = useI18n();
    const [status, setStatus] = useState<SiteReservationStatus | 'all'>('all');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 350);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const { data, isPending, isError, error, isFetching } = useQuery({
        queryKey: ['site-reservations', status, search, page],
        queryFn: () => getSiteReservations({ status: status === 'all' ? undefined : status, search, page }),
        placeholderData: keepPreviousData,
        refetchInterval: 60_000,
    });

    const reservations = data?.data ?? [];
    const meta = data?.meta;

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{t('Réservations site web')}</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {t('Les réservations faites sur bogosland.com, les plus récentes d’abord.')}
                    </p>
                </div>
                <Button asChild variant="outline" size="sm">
                    <a href={WP_ADMIN_URL} target="_blank" rel="noopener noreferrer">
                        <ExternalLink />
                        {t('Confirmer sur le site')}
                    </a>
                </Button>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                    {STATUS_TABS.map((tab) => (
                        <Chip
                            key={tab.value}
                            size="sm"
                            selected={status === tab.value}
                            onClick={() => {
                                setStatus(tab.value);
                                setPage(1);
                            }}
                        >
                            {t(tab.label)}
                            {data?.counts && (
                                <span className="rounded-sm bg-tint/[0.06] px-1.5 py-0.5 text-[11px] tabular-nums">
                                    {data.counts[tab.value]}
                                </span>
                            )}
                        </Chip>
                    ))}
                </div>
                <div className="relative w-full lg:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        placeholder={t('Nom, téléphone ou email')}
                        className="pl-9"
                        aria-label={t('Rechercher une réservation')}
                    />
                </div>
            </div>

            {isPending ? (
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-md" />
                    ))}
                </div>
            ) : isError ? (
                <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                </Card>
            ) : reservations.length === 0 ? (
                <EmptyState
                    icon={Globe}
                    title={t('Aucune réservation')}
                    description={search ? t('Aucun résultat pour cette recherche.') : t('Aucune réservation du site pour ce filtre.')}
                />
            ) : (
                <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
                    {/* Desktop table */}
                    <Card className="hidden overflow-hidden lg:block">
                        <table className="w-full text-sm">
                            <thead className="border-b border-tint/[0.06] bg-tint/[0.02] text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">#</th>
                                    <th className="px-4 py-3 font-medium">{t('Client')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Service')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Rendez-vous')}</th>
                                    <th className="px-4 py-3 text-right font-medium">{t('Prix')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Statut')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Reçue le')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reservations.map((reservation) => (
                                    <ReservationRow key={reservation.id} reservation={reservation} />
                                ))}
                            </tbody>
                        </table>
                    </Card>

                    {/* Mobile cards */}
                    <div className="space-y-2 lg:hidden">
                        {reservations.map((reservation) => (
                            <ReservationCard key={reservation.id} reservation={reservation} />
                        ))}
                    </div>

                    {meta && meta.last_page > 1 && (
                        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                            <span>
                                {t('Page {page} sur {pages} · {total} réservations', {
                                    page: meta.current_page,
                                    pages: meta.last_page,
                                    total: meta.total,
                                })}
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                                    <ChevronLeft />
                                    {t('Précédent')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= meta.last_page}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    {t('Suivant')}
                                    <ChevronRight />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
}

function StatusBadge({ status }: { status: SiteReservationStatus }) {
    const { t } = useI18n();
    const badge = STATUS_BADGE[status] ?? { label: status, variant: 'default' as const };
    return <Badge variant={badge.variant}>{t(badge.label)}</Badge>;
}

function ServiceLabel({ reservation }: { reservation: SiteReservation }) {
    const { t } = useI18n();
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-foreground">{reservation.service ?? '—'}</span>
            {reservation.is_pack && <Badge variant="outline">{t('Pack')}</Badge>}
        </span>
    );
}

function ReservationRow({ reservation }: { reservation: SiteReservation }) {
    return (
        <tr className="border-b border-tint/[0.04] align-top last:border-0">
            <td className="px-4 py-3 text-xs text-muted-foreground">#{reservation.id}</td>
            <td className="px-4 py-3">
                <div className="font-medium text-foreground">{reservation.client_name}</div>
                <a href={`tel:${reservation.client_phone}`} className="text-xs text-muted-foreground hover:text-accent">
                    {reservation.client_phone}
                </a>
                {reservation.client_email && <div className="text-xs text-muted-foreground">{reservation.client_email}</div>}
            </td>
            <td className="px-4 py-3">
                <ServiceLabel reservation={reservation} />
                {reservation.notes && (
                    <p className="mt-1 max-w-[32ch] text-xs text-muted-foreground">{reservation.notes}</p>
                )}
            </td>
            <td className="px-4 py-3 text-muted-foreground">
                <div className="text-foreground">{formatWallDate(reservation.date)}</div>
                <div className="text-xs">
                    {reservation.time} · {reservation.duration_min} min
                </div>
            </td>
            <td className="px-4 py-3 text-right font-medium">{formatCurrency(reservation.price)}</td>
            <td className="px-4 py-3">
                <StatusBadge status={reservation.status} />
            </td>
            <td className="px-4 py-3 text-xs text-muted-foreground">{formatWallDateTime(reservation.created_at)}</td>
        </tr>
    );
}

function ReservationCard({ reservation }: { reservation: SiteReservation }) {
    const { t } = useI18n();
    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold text-foreground">{reservation.client_name}</p>
                    <a
                        href={`tel:${reservation.client_phone}`}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
                    >
                        <Phone className="h-3 w-3" />
                        {reservation.client_phone}
                    </a>
                </div>
                <StatusBadge status={reservation.status} />
            </div>
            <div className="mt-3 text-sm">
                <ServiceLabel reservation={reservation} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatWallDate(reservation.date)} · {reservation.time}
                </span>
                <span className="font-medium text-foreground">{formatCurrency(reservation.price)}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
                {t('Reçue le {date}', { date: formatWallDateTime(reservation.created_at) })}
            </p>
        </Card>
    );
}
