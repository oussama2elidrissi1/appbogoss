import { CalendarClock, Mail, Pencil, Phone, User, Users } from 'lucide-react';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
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
import { Separator } from '@/components/ui/separator';

const STATUS_META: Record<AppointmentStatus, { label: string; variant: BadgeProps['variant'] }> = {
    pending: { label: 'En attente', variant: 'default' },
    confirmed: { label: 'Confirmé', variant: 'accent' },
    completed: { label: 'Terminé', variant: 'success' },
    cancelled: { label: 'Annulé', variant: 'destructive' },
    no_show: { label: 'Absent', variant: 'destructive' },
};

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
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Fermer
                    </Button>
                    <Button type="button" variant="accent" onClick={onEdit}>
                        <Pencil />
                        Modifier
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
