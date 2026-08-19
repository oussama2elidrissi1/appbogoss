import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    AlertCircle,
    CalendarClock,
    CalendarPlus,
    Check,
    Loader2,
    Mail,
    Pencil,
    Phone,
    User,
    Users,
    X,
} from 'lucide-react';
import { confirmAppointment, getErrorMessage, proposeAlternateSlot, refuseAppointment } from '@/lib/api';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { Appointment, AppointmentStatus } from '@/types/workday';
import { itemsOf } from './agendaEvents';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Separator } from '@/components/ui/separator';

const STATUS_META: Record<AppointmentStatus, { label: string; variant: BadgeProps['variant'] }> = {
    pending: { label: 'En attente', variant: 'default' },
    confirmed: { label: 'Confirmé', variant: 'accent' },
    completed: { label: 'Terminé', variant: 'success' },
    cancelled: { label: 'Annulé', variant: 'destructive' },
    no_show: { label: 'Absent', variant: 'destructive' },
    refused: { label: 'Refusé', variant: 'destructive' },
};

const REFUSAL_REASONS = [
    'Créneau indisponible',
    'Service indisponible',
    'Capacité complète',
    'Informations incorrectes',
    'Autre',
];

interface ReservationDetailsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    appointment: Appointment | null;
    onEdit: () => void;
}

/** Read-only recap opened by clicking a reservation on the calendar — client contact front and center. */
export function ReservationDetailsDialog({
    open,
    onOpenChange,
    appointment,
    onEdit,
}: ReservationDetailsDialogProps) {
    const queryClient = useQueryClient();
    const { hasPermission } = useAuth();
    const [refusing, setRefusing] = useState(false);
    const [refuseReason, setRefuseReason] = useState(REFUSAL_REASONS[0]);
    const [proposing, setProposing] = useState(false);
    const [proposeDate, setProposeDate] = useState('');
    const [proposeTime, setProposeTime] = useState('');
    const [proposeNote, setProposeNote] = useState('');

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['appointments'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    const confirmMutation = useMutation({
        mutationFn: (id: number) => confirmAppointment(id),
        onSuccess: () => {
            invalidate();
            onOpenChange(false);
        },
    });

    const refuseMutation = useMutation({
        mutationFn: (id: number) => refuseAppointment(id, refuseReason),
        onSuccess: () => {
            invalidate();
            setRefusing(false);
            onOpenChange(false);
        },
    });

    const proposeMutation = useMutation({
        mutationFn: (id: number) => {
            const durationMinutes = appointment
                ? Math.max(5, Math.round((new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()) / 60000))
                : 30;
            const [hours, minutes] = proposeTime.split(':').map(Number);
            const start = new Date(`${proposeDate}T00:00:00`);
            start.setHours(hours, minutes, 0, 0);
            const end = new Date(start.getTime() + durationMinutes * 60000);

            return proposeAlternateSlot(id, {
                proposed_starts_at: start.toISOString(),
                proposed_ends_at: end.toISOString(),
                proposal_note: proposeNote.trim() || null,
            });
        },
        onSuccess: () => {
            invalidate();
            setProposing(false);
            onOpenChange(false);
        },
    });

    if (!appointment) return null;

    const contact = appointment.client ??
        appointment.clients?.find((client) => client.id === appointment.client_id) ??
        appointment.clients?.[0] ??
        null;
    const items = itemsOf(appointment);
    const people = appointment.people?.length
        ? appointment.people
        : [{ name: contact?.name ?? null, is_contact: true }];
    const totalPrice = items.reduce((sum, item) => sum + (item.service?.price ?? 0), 0);
    const status = STATUS_META[appointment.status] ?? STATUS_META.pending;
    const totalDuration = items.reduce((sum, item) => sum + (item.service?.duration_minutes ?? 0), 0);
    // Staff-only actions: a partner viewing their own pending booking must never see
    // Accepter/Refuser/Proposer (those endpoints 403 for anyone without agenda.manage).
    const isReviewable =
        hasPermission('agenda.manage') && Boolean(appointment.partner_id) && appointment.status === 'pending';
    const anyActionPending = confirmMutation.isPending || refuseMutation.isPending || proposeMutation.isPending;

    function openProposeDialog() {
        const start = new Date(appointment!.starts_at);
        const localDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        setProposeDate(localDate);
        setProposeTime(formatTime(appointment!.starts_at));
        setProposeNote('');
        setProposing(true);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-3">
                        <DialogTitle>Détail de la réservation</DialogTitle>
                        <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <DialogDescription className="flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatDate(appointment.starts_at)} · {formatTime(appointment.starts_at)} –{' '}
                        {formatTime(appointment.ends_at)}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {appointment.partner && (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-accent/25 bg-accent/[0.06] px-3.5 py-2.5">
                            <span className="text-sm text-foreground">
                                Apportée par le partenaire{' '}
                                <span className="font-semibold">{appointment.partner.name}</span>
                            </span>
                            {appointment.partner_commission != null && appointment.partner_commission > 0 && (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    Commission estimée :{' '}
                                    <span className="font-semibold text-accent">
                                        {formatCurrency(appointment.partner_commission, { maximumFractionDigits: 2 })}
                                    </span>
                                </span>
                            )}
                        </div>
                    )}

                    {appointment.proposal_status === 'proposed' && (
                        <div className="flex items-center gap-2 rounded-md border border-sky-500/25 bg-sky-500/[0.06] px-3.5 py-2.5 text-xs text-muted-foreground">
                            <CalendarPlus className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                            Créneau alternatif proposé le {formatDate(appointment.proposed_starts_at!)} à{' '}
                            {formatTime(appointment.proposed_starts_at!)} — en attente de la réponse du partenaire.
                        </div>
                    )}

                    <div>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            <User className="h-3.5 w-3.5" />
                            Contact
                        </p>
                        {!contact ? (
                            <p className="text-sm text-muted-foreground">Aucun client renseigné.</p>
                        ) : (
                            <div className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.08] bg-tint/[0.025] px-3.5 py-2.5">
                                <span className="flex min-w-0 items-center gap-2">
                                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="truncate text-sm font-medium text-foreground">{contact.name}</span>
                                </span>
                                {contact.phone ? (
                                    <a
                                        href={`tel:${contact.phone}`}
                                        className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                                    >
                                        <Phone className="h-3.5 w-3.5" />
                                        {contact.phone}
                                    </a>
                                ) : (
                                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                                        <Mail className="h-3.5 w-3.5" />
                                        Sans téléphone
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <Separator />

                    <div>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                            {people.length} personne{people.length > 1 ? 's' : ''} · Prestations
                        </p>
                        <div className="space-y-3">
                            {people.map((person, personIndex) => {
                                const personItems = items.filter(
                                    (item) => (item.person_index ?? 0) === personIndex,
                                );
                                return (
                                    <div key={personIndex}>
                                        <p className="mb-1.5 text-xs font-semibold text-foreground">
                                            {person.name?.trim() || `Personne ${personIndex + 1}`}
                                            {personIndex === 0 && (
                                                <span className="ml-1.5 font-normal text-muted-foreground">
                                                    (contact)
                                                </span>
                                            )}
                                        </p>
                                        {personItems.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">Aucune prestation.</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {personItems.map((item, index) => (
                                                    <div
                                                        key={`${item.service_id}-${index}`}
                                                        className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-2.5"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-foreground">
                                                                {item.service?.name ?? 'Prestation'}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {item.service?.duration_minutes ?? 0} min ·{' '}
                                                                {item.employee?.name ?? 'Non assigné'}
                                                            </p>
                                                        </div>
                                                        <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                                                            {formatCurrency(item.service?.price ?? 0, {
                                                                maximumFractionDigits: 2,
                                                            })}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-2 flex items-center justify-between px-1 text-sm">
                            <span className="text-muted-foreground">Total</span>
                            <span className="font-semibold text-accent">
                                {formatCurrency(totalPrice, { maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        {isReviewable && (
                            <div className="mt-1 flex items-center justify-between px-1 text-xs text-muted-foreground">
                                <span>Durée estimée</span>
                                <span>{totalDuration} min</span>
                            </div>
                        )}
                    </div>

                    {appointment.notes && (
                        <>
                            <Separator />
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    Notes
                                </p>
                                <p className="whitespace-pre-line text-sm text-foreground">{appointment.notes}</p>
                            </div>
                        </>
                    )}

                    {(confirmMutation.isError || refuseMutation.isError) && (
                        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {getErrorMessage(confirmMutation.error ?? refuseMutation.error)}
                        </div>
                    )}
                </div>

                <DialogFooter className={cn(isReviewable && 'flex-col items-stretch gap-2 sm:flex-col')}>
                    {isReviewable ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="accent"
                                    className="flex-1"
                                    disabled={anyActionPending}
                                    onClick={() => confirmMutation.mutate(appointment.id)}
                                >
                                    {confirmMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                                    Accepter
                                </Button>
                                <Button type="button" variant="outline" disabled={anyActionPending} onClick={onEdit}>
                                    <Pencil />
                                    Modifier avant acceptation
                                </Button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    disabled={anyActionPending}
                                    onClick={openProposeDialog}
                                >
                                    <CalendarPlus />
                                    Proposer un autre créneau
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    disabled={anyActionPending}
                                    onClick={() => setRefusing(true)}
                                >
                                    <X />
                                    Refuser
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Fermer
                            </Button>
                            <Button type="button" variant="accent" onClick={onEdit}>
                                <Pencil />
                                Modifier
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>

            <ConfirmDialog
                open={refusing}
                onOpenChange={setRefusing}
                title="Refuser cette réservation ?"
                description="Le partenaire verra le motif choisi sur sa fiche de réservation."
                confirmLabel="Refuser"
                variant="destructive"
                loading={refuseMutation.isPending}
                onConfirm={() => refuseMutation.mutate(appointment.id)}
            >
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Motif
                    </label>
                    <select
                        value={refuseReason}
                        onChange={(event) => setRefuseReason(event.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground shadow-sm focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10"
                    >
                        {REFUSAL_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                                {reason}
                            </option>
                        ))}
                    </select>
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                open={proposing}
                onOpenChange={setProposing}
                title="Proposer un autre créneau"
                description="Le partenaire recevra cette proposition et pourra l'accepter ou la refuser."
                confirmLabel="Envoyer la proposition"
                variant="accent"
                loading={proposeMutation.isPending}
                onConfirm={() => proposeMutation.mutate(appointment.id)}
            >
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Date
                        </label>
                        <Input type="date" value={proposeDate} onChange={(event) => setProposeDate(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Heure
                        </label>
                        <Input type="time" value={proposeTime} onChange={(event) => setProposeTime(event.target.value)} />
                    </div>
                </div>
                <div className="mt-3 space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Note (facultatif)
                    </label>
                    <Input
                        value={proposeNote}
                        onChange={(event) => setProposeNote(event.target.value)}
                        placeholder="Ex. créneau du matin complet"
                    />
                </div>
                {proposeMutation.isError && (
                    <p className="mt-2 text-xs text-destructive">{getErrorMessage(proposeMutation.error)}</p>
                )}
            </ConfirmDialog>
        </Dialog>
    );
}
