import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, CalendarPlus, Search } from 'lucide-react';
import { getAppointments, getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';
import type { AppointmentStatus } from '@/types/workday';

const STATUS_META: Record<AppointmentStatus, { label: string; dot: string; variant: 'outline' | 'success' | 'destructive' }> = {
    pending: { label: 'En attente', dot: 'bg-amber-400', variant: 'outline' },
    confirmed: { label: 'Confirmée', dot: 'bg-sky-400', variant: 'outline' },
    completed: { label: 'Payée / Terminée', dot: 'bg-success', variant: 'success' },
    cancelled: { label: 'Annulée', dot: 'bg-destructive', variant: 'destructive' },
    no_show: { label: 'Absent(e)', dot: 'bg-muted-foreground', variant: 'outline' },
    refused: { label: 'Refusée', dot: 'bg-destructive', variant: 'destructive' },
};

// AppointmentController defaults to "today only" when no date range is
// given (built for the staff day-based Agenda) — the partner's own list
// needs a broad default window instead, showing past and upcoming bookings
// until they narrow it down themselves.
function defaultRange(): { from: string; to: string } {
    const today = new Date();
    const from = new Date(today);
    from.setFullYear(from.getFullYear() - 1);
    const to = new Date(today);
    to.setFullYear(to.getFullYear() + 1);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function PartnerReservations() {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<string>('all');
    const [{ from: defaultFrom, to: defaultTo }] = useState(defaultRange);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const { data, isPending, isError, error, refetch } = useQuery({
        queryKey: ['partner-portal', 'reservations', dateFrom, dateTo, status],
        queryFn: () =>
            getAppointments({
                dateFrom: dateFrom || defaultFrom,
                dateTo: dateTo || defaultTo,
                status: status !== 'all' ? status : undefined,
            }),
    });

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return data ?? [];
        return (data ?? []).filter((appointment) =>
            [appointment.client?.name, appointment.service?.name]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term)),
        );
    }, [data, search]);

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{t('Mes réservations')}</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {t('Le suivi de toutes les réservations que vous avez apportées.')}
                    </p>
                </div>
                <Button variant="accent" asChild>
                    <Link to="/partner/reservations/new">
                        <CalendarPlus className="h-4 w-4" />
                        {t('Nouvelle réservation')}
                    </Link>
                </Button>
            </div>

            <Card className="flex flex-wrap items-end gap-3 p-4">
                <div className="relative min-w-[14rem] flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('Client, service...')}
                        className="pl-10"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t('Du')}
                    </label>
                    <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t('Au')}
                    </label>
                    <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t('Statut')}
                    </label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-10 w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('Tous')}</SelectItem>
                            {Object.entries(STATUS_META).map(([key, meta]) => (
                                <SelectItem key={key} value={key}>
                                    {t(meta.label)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </Card>

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
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={CalendarPlus}
                    title={t('Aucune réservation')}
                    description={t('Créez votre première réservation pour un client.')}
                />
            ) : (
                <>
                    {/* Desktop table */}
                    <Card className="hidden overflow-hidden lg:block">
                        <table className="w-full text-sm">
                            <thead className="border-b border-tint/[0.06] bg-tint/[0.02] text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">{t('Réf.')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Client')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Service')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Date')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Heure')}</th>
                                    <th className="px-4 py-3 text-right font-medium">{t('Montant')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Statut')}</th>
                                    <th className="px-4 py-3 text-right font-medium">{t('Commission')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((appointment) => {
                                    const meta = STATUS_META[appointment.status];
                                    return (
                                        <tr
                                            key={appointment.id}
                                            className="cursor-pointer border-b border-tint/[0.04] last:border-0 hover:bg-tint/[0.02]"
                                            onClick={() => navigate(`/partner/reservations/${appointment.id}`)}
                                        >
                                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                                RSV-{appointment.id}
                                            </td>
                                            <td className="px-4 py-3 font-medium">{appointment.client?.name ?? '—'}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{appointment.service?.name ?? '—'}</td>
                                            <td className="px-4 py-3">{formatDate(appointment.starts_at)}</td>
                                            <td className="px-4 py-3">{formatTime(appointment.starts_at)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums">
                                                {appointment.service ? formatCurrency(appointment.service.price) : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={meta.variant} className="gap-1.5">
                                                    <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                                                    {t(meta.label)}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-accent">
                                                {appointment.partner_commission != null
                                                    ? formatCurrency(appointment.partner_commission, { maximumFractionDigits: 2 })
                                                    : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </Card>

                    {/* Mobile cards */}
                    <div className="space-y-2 lg:hidden">
                        {filtered.map((appointment) => {
                            const meta = STATUS_META[appointment.status];
                            return (
                                <Link key={appointment.id} to={`/partner/reservations/${appointment.id}`}>
                                    <Card className="p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold">{appointment.client?.name ?? '—'}</p>
                                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                    {appointment.service?.name ?? '—'}
                                                </p>
                                            </div>
                                            <Badge variant={meta.variant} className="shrink-0 gap-1.5">
                                                <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                                                {t(meta.label)}
                                            </Badge>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                                            <span>
                                                {formatDate(appointment.starts_at)} · {formatTime(appointment.starts_at)}
                                            </span>
                                            <span className="font-medium text-accent">
                                                {appointment.partner_commission != null
                                                    ? formatCurrency(appointment.partner_commission, { maximumFractionDigits: 2 })
                                                    : ''}
                                            </span>
                                        </div>
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>
                </>
            )}
        </motion.div>
    );
}
