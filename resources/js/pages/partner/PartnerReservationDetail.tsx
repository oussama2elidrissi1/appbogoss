import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    ArrowLeft,
    Ban,
    Calendar,
    CalendarPlus,
    Check,
    Clock,
    HandCoins,
    Loader2,
    PartyPopper,
    Sparkles,
    User,
    X,
} from 'lucide-react';
import { acceptProposal, declineProposal, getAppointment, getErrorMessage, updateAppointment } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { pageFade } from '@/lib/motion';
import type { AppointmentStatus } from '@/types/workday';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
    pending: 'EN ATTENTE',
    confirmed: 'CONFIRMÉE',
    completed: 'PAYÉE / TERMINÉE',
    cancelled: 'ANNULÉE',
    no_show: 'ABSENT(E)',
    refused: 'REFUSÉE',
};

const STATUS_BADGE: Record<AppointmentStatus, 'outline' | 'success' | 'destructive'> = {
    pending: 'outline',
    confirmed: 'outline',
    completed: 'success',
    cancelled: 'destructive',
    no_show: 'destructive',
    refused: 'destructive',
};

export default function PartnerReservationDetail() {
    const { t } = useI18n();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const [cancelOpen, setCancelOpen] = useState(false);
    const justCreated = Boolean((location.state as { justCreated?: boolean } | null)?.justCreated);

    const appointmentId = Number(id);

    const { data: appointment, isPending, isError, error } = useQuery({
        queryKey: ['partner-portal', 'reservation', appointmentId],
        queryFn: () => getAppointment(appointmentId),
        enabled: Number.isFinite(appointmentId),
    });

    const cancelMutation = useMutation({
        mutationFn: () => updateAppointment(appointmentId, { status: 'cancelled' }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['partner-portal'] });
            setCancelOpen(false);
        },
    });

    const acceptProposalMutation = useMutation({
        mutationFn: () => acceptProposal(appointmentId),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['partner-portal'] }),
    });

    const declineProposalMutation = useMutation({
        mutationFn: () => declineProposal(appointmentId),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['partner-portal'] }),
    });

    if (isPending) {
        return (
            <div className="mx-auto max-w-2xl space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full rounded-md" />
            </div>
        );
    }

    if (isError || !appointment) {
        return (
            <Card className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-12 text-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="mt-2 text-sm text-destructive">
                    {error ? getErrorMessage(error) : t('Réservation introuvable.')}
                </p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/partner/reservations')}>
                    {t('Retour à mes réservations')}
                </Button>
            </Card>
        );
    }

    const reference = `RSV-${appointment.id}`;

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="mx-auto max-w-2xl space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate('/partner/reservations')} aria-label={t('Retour')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <p className="font-mono text-xs text-muted-foreground">{reference}</p>
                    <h1 className="text-xl font-semibold tracking-tight">{t('Détail de la réservation')}</h1>
                </div>
            </div>

            {justCreated && (
                <Card className="flex items-center gap-3 border-success/30 bg-success/[0.08] p-4">
                    <PartyPopper className="h-5 w-5 shrink-0 text-success" />
                    <p className="text-sm text-success">
                        {t('Réservation {ref} créée avec succès — elle a été envoyée à BOGOSLAND pour confirmation.', { ref: reference })}
                    </p>
                </Card>
            )}

            <Card className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Badge variant={STATUS_BADGE[appointment.status]} className="text-xs">
                        {t(STATUS_LABEL[appointment.status])}
                    </Badge>
                    {(appointment.status === 'pending' || appointment.status === 'confirmed') && (
                        <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                            <Ban className="h-3.5 w-3.5" />
                            {t('Annuler')}
                        </Button>
                    )}
                </div>

                <dl className="mt-5 space-y-3 divide-y divide-tint/[0.06]">
                    <DetailRow icon={User} label={t('Client')} value={appointment.client?.name ?? '—'} sub={appointment.client?.phone} />
                    <DetailRow icon={Sparkles} label={t('Service')} value={appointment.service?.name ?? '—'} />
                    <DetailRow icon={Calendar} label={t('Date')} value={formatDate(appointment.starts_at)} />
                    <DetailRow icon={Clock} label={t('Heure')} value={formatTime(appointment.starts_at)} />
                    <DetailRow
                        icon={HandCoins}
                        label={t('Montant')}
                        value={appointment.service ? formatCurrency(appointment.service.price) : '—'}
                    />
                    <DetailRow
                        icon={HandCoins}
                        label={t('Commission estimée')}
                        value={
                            appointment.partner_commission != null
                                ? formatCurrency(appointment.partner_commission, { maximumFractionDigits: 2 })
                                : '—'
                        }
                        accent
                    />
                </dl>
            </Card>

            {appointment.proposal_status === 'proposed' && (
                <Card className="space-y-3 border-sky-500/25 bg-sky-500/[0.06] p-5 sm:p-6">
                    <div className="flex items-start gap-2.5">
                        <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                        <div>
                            <p className="text-sm font-semibold text-foreground">{t('BOGOSLAND vous propose un autre créneau')}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                                {formatDate(appointment.proposed_starts_at!)} {t('à')} {formatTime(appointment.proposed_starts_at!)}
                            </p>
                            {appointment.proposal_note && (
                                <p className="mt-1 text-xs italic text-muted-foreground">« {appointment.proposal_note} »</p>
                            )}
                        </div>
                    </div>
                    {(acceptProposalMutation.isError || declineProposalMutation.isError) && (
                        <p className="text-xs text-destructive">
                            {getErrorMessage(acceptProposalMutation.error ?? declineProposalMutation.error)}
                        </p>
                    )}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="accent"
                            size="sm"
                            disabled={acceptProposalMutation.isPending || declineProposalMutation.isPending}
                            onClick={() => acceptProposalMutation.mutate()}
                        >
                            {acceptProposalMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            {t('Accepter')}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={acceptProposalMutation.isPending || declineProposalMutation.isPending}
                            onClick={() => declineProposalMutation.mutate()}
                        >
                            {declineProposalMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                            {t('Refuser')}
                        </Button>
                    </div>
                </Card>
            )}

            <Card className="p-5 sm:p-6">
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t('Suivi')}</h2>
                <Timeline appointment={appointment} />
                <p className="mt-4 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2.5 text-xs text-muted-foreground">
                    {t('La commission ci-dessus est une estimation liée à cette réservation. La commission réellement gagnée (une fois le client reçu et le paiement encaissé au salon) apparaît dans')}{' '}
                    <Link to="/partner/commissions" className="font-medium text-accent hover:underline">
                        {t('Mes commissions')}
                    </Link>
                    .
                </p>
            </Card>

            <ConfirmDialog
                open={cancelOpen}
                onOpenChange={setCancelOpen}
                title={t('Annuler cette réservation ?')}
                description={t('{ref} sera marquée annulée. Cette action ne peut pas être défaite depuis cet espace.', { ref: reference })}
                confirmLabel={t('Annuler la réservation')}
                loading={cancelMutation.isPending}
                onConfirm={() => cancelMutation.mutate()}
            />
        </motion.div>
    );
}

function DetailRow({
    icon: Icon,
    label,
    value,
    sub,
    accent,
}: {
    icon: typeof User;
    label: string;
    value: string;
    sub?: string | null;
    accent?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3 pt-3 first:pt-0">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {label}
            </span>
            <span className={cn('text-right text-sm font-medium', accent && 'text-accent')}>
                {value}
                {sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({sub})</span>}
            </span>
        </div>
    );
}

const TERMINAL_LABEL: Partial<Record<AppointmentStatus, string>> = {
    cancelled: 'Annulée',
    no_show: 'Non honorée',
    refused: 'Refusée par BOGOSLAND',
};

function Timeline({ appointment }: { appointment: { status: AppointmentStatus; created_at?: string | null } }) {
    const { t } = useI18n();
    const terminalLabel = TERMINAL_LABEL[appointment.status];
    const confirmed = appointment.status === 'confirmed' || appointment.status === 'completed';
    const completed = appointment.status === 'completed';

    const steps = [
        { label: 'Réservation créée', done: true, date: appointment.created_at },
        terminalLabel
            ? { label: terminalLabel, done: true, failed: true }
            : { label: 'Acceptée par BOGOSLAND', done: confirmed },
        !terminalLabel && { label: 'Client reçu et payé au salon', done: completed },
    ].filter(Boolean) as Array<{ label: string; done: boolean; failed?: boolean; date?: string | null }>;

    return (
        <ol className="mt-4 space-y-0">
            {steps.map((step, index) => (
                <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
                    {index < steps.length - 1 && (
                        <span
                            className={cn(
                                'absolute left-[11px] top-6 h-full w-px',
                                step.done ? 'bg-accent/40' : 'bg-tint/[0.08]',
                            )}
                        />
                    )}
                    <span
                        className={cn(
                            'z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full',
                            step.failed
                                ? 'bg-destructive/[0.16] text-destructive'
                                : step.done
                                  ? 'bg-accent text-accent-foreground'
                                  : 'bg-tint/[0.08] text-muted-foreground',
                        )}
                    >
                        {step.failed ? <X className="h-3 w-3" /> : step.done ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <div className="pt-0.5">
                        <p className={cn('text-sm font-medium', !step.done && 'text-muted-foreground')}>{t(step.label)}</p>
                        {step.date && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {formatDate(step.date)} · {formatTime(step.date)}
                            </p>
                        )}
                    </div>
                </li>
            ))}
        </ol>
    );
}
