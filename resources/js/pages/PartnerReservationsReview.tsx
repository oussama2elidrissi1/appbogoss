import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, CalendarCheck, Handshake, Users } from 'lucide-react';
import { getAppointments, getEmployees, getErrorMessage, getServices } from '@/lib/api';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';
import { ReservationDetailsDialog } from '@/components/agenda/ReservationDetailsDialog';
import { ReservationDialog } from '@/components/agenda/ReservationDialog';
import type { Appointment } from '@/types/workday';

function wideRange(): { from: string; to: string } {
    const today = new Date();
    const from = new Date(today);
    from.setMonth(from.getMonth() - 1);
    const to = new Date(today);
    to.setFullYear(to.getFullYear() + 1);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** §26 — every pending partner booking, across every partner, in one triage queue. */
export default function PartnerReservationsReview() {
    const { t } = useI18n();
    const [selected, setSelected] = useState<Appointment | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);

    const { data: appointments, isPending, isError, error, refetch } = useQuery({
        queryKey: ['appointments', 'partner-review'],
        queryFn: () => {
            const { from, to } = wideRange();
            return getAppointments({ hasPartner: true, status: 'pending', dateFrom: from, dateTo: to });
        },
        refetchInterval: 30_000,
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', 'agenda'],
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
    });

    const { data: services = [] } = useQuery({
        queryKey: ['services', 'agenda', 'all'],
        queryFn: () => getServices(),
        staleTime: 5 * 60_000,
    });

    function openRow(appointment: Appointment) {
        setSelected(appointment);
        setDetailsOpen(true);
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('Réservations partenaires')}</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t("Demandes en attente d'une décision — accepter, proposer un autre créneau ou refuser.")}
                </p>
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
                </Card>
            ) : !appointments || appointments.length === 0 ? (
                <EmptyState
                    icon={CalendarCheck}
                    title={t('Aucune demande en attente')}
                    description={t('Toutes les réservations partenaires ont été traitées.')}
                />
            ) : (
                <>
                    {/* Desktop table */}
                    <Card className="hidden overflow-hidden lg:block">
                        <table className="w-full text-sm">
                            <thead className="border-b border-tint/[0.06] bg-tint/[0.02] text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">{t('Partenaire')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Contact')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Participants')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Date')}</th>
                                    <th className="px-4 py-3 text-right font-medium">{t('Total')}</th>
                                    <th className="px-4 py-3 text-right font-medium">{t('Commission')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {appointments.map((appointment) => (
                                    <ReviewRow key={appointment.id} appointment={appointment} onClick={() => openRow(appointment)} />
                                ))}
                            </tbody>
                        </table>
                    </Card>

                    {/* Mobile cards */}
                    <div className="space-y-2 lg:hidden">
                        {appointments.map((appointment) => (
                            <ReviewCard key={appointment.id} appointment={appointment} onClick={() => openRow(appointment)} />
                        ))}
                    </div>
                </>
            )}

            <ReservationDetailsDialog
                open={detailsOpen}
                onOpenChange={(open) => {
                    setDetailsOpen(open);
                    if (!open) void refetch();
                }}
                appointment={selected}
                onEdit={() => {
                    setDetailsOpen(false);
                    setEditOpen(true);
                }}
            />

            <ReservationDialog
                open={editOpen}
                onOpenChange={(open) => {
                    setEditOpen(open);
                    if (!open) void refetch();
                }}
                mode="edit"
                appointment={selected}
                initialStart={null}
                initialResourceId={null}
                employees={employees}
                services={services}
            />
        </motion.div>
    );
}

function ReviewRow({ appointment, onClick }: { appointment: Appointment; onClick: () => void }) {
    const contact = appointment.client ?? appointment.clients?.[0] ?? null;
    const participantsCount = appointment.people?.length ?? 1;

    return (
        <tr
            onClick={onClick}
            className="cursor-pointer border-b border-tint/[0.04] transition-colors last:border-0 hover:bg-tint/[0.03]"
        >
            <td className="px-4 py-3">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Handshake className="h-3.5 w-3.5 text-accent" />
                    {appointment.partner?.name ?? '—'}
                </span>
            </td>
            <td className="px-4 py-3 text-muted-foreground">{contact?.name ?? '—'}</td>
            <td className="px-4 py-3 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {participantsCount}
                </span>
            </td>
            <td className="px-4 py-3 text-xs text-muted-foreground">
                {formatDate(appointment.starts_at)} · {formatTime(appointment.starts_at)}
            </td>
            <td className="px-4 py-3 text-right font-medium">
                {formatCurrency((appointment.reservation_items ?? []).reduce((sum, item) => sum + (item.service?.price ?? 0), 0))}
            </td>
            <td className="px-4 py-3 text-right">
                {appointment.partner_commission != null && (
                    <Badge variant="success">{formatCurrency(appointment.partner_commission, { maximumFractionDigits: 2 })}</Badge>
                )}
            </td>
        </tr>
    );
}

function ReviewCard({ appointment, onClick }: { appointment: Appointment; onClick: () => void }) {
    const { t } = useI18n();
    const contact = appointment.client ?? appointment.clients?.[0] ?? null;
    const participantsCount = appointment.people?.length ?? 1;

    return (
        <Card className="cursor-pointer p-4 transition-colors hover:bg-tint/[0.03]" onClick={onClick}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Handshake className="h-3.5 w-3.5 text-accent" />
                    {appointment.partner?.name ?? '—'}
                </span>
                {appointment.partner_commission != null && (
                    <Badge variant="success">{formatCurrency(appointment.partner_commission, { maximumFractionDigits: 2 })}</Badge>
                )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{contact?.name ?? '—'}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {participantsCount > 1
                        ? t('{n} participants', { n: participantsCount })
                        : t('{n} participant', { n: participantsCount })}
                </span>
                <span>
                    {formatDate(appointment.starts_at)} · {formatTime(appointment.starts_at)}
                </span>
            </div>
        </Card>
    );
}
