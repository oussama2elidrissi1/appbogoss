import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarCheck, Loader2, Users } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { getPos2TodayAppointments, openPos2AppointmentInvoice, pos2Keys } from '@/lib/pos2Api';
import { formatCurrency } from '@/lib/utils';
import type { Pos2Invoice } from '@/types/pos2';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

interface Pos2ReservationsDialogProps {
    open: boolean;
    onClose: () => void;
    /** Called with the (created or already-open) invoice. */
    onOpened: (invoice: Pos2Invoice) => void;
}

/**
 * §37 — today's reservations, each openable at the caisse. Already-opened
 * ones jump back to their invoice instead of duplicating it.
 */
export function Pos2ReservationsDialog({ open, onClose, onOpened }: Pos2ReservationsDialogProps) {
    const queryClient = useQueryClient();

    const { data: appointments, isPending, isError, error } = useQuery({
        queryKey: pos2Keys.appointmentsToday,
        queryFn: getPos2TodayAppointments,
        enabled: open,
        refetchInterval: open ? 30_000 : false,
    });

    const openMutation = useMutation({
        mutationFn: openPos2AppointmentInvoice,
        onSuccess: (invoice) => {
            void queryClient.invalidateQueries({ queryKey: pos2Keys.all });
            onOpened(invoice);
        },
    });

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-h-[88dvh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-display text-xl">
                        <CalendarCheck className="h-5 w-5 text-accent" />
                        Réservations du jour
                    </DialogTitle>
                </DialogHeader>

                {isPending ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map((index) => (
                            <Skeleton key={index} className="h-16 w-full" />
                        ))}
                    </div>
                ) : isError ? (
                    <p className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3 py-2.5 text-xs text-destructive">
                        <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                        {getErrorMessage(error)}
                    </p>
                ) : (appointments ?? []).length === 0 ? (
                    <p className="rounded-md border border-dashed border-tint/[0.15] px-4 py-8 text-center text-sm text-muted-foreground">
                        Aucune réservation aujourd'hui.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {(appointments ?? []).map((appointment) => (
                            <li
                                key={appointment.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3.5 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        <span className="tabular-nums text-accent">{appointment.time}</span>
                                        <span className="truncate">{appointment.client_name}</span>
                                        {appointment.people_count > 1 && (
                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                <Users className="h-3 w-3" />
                                                {appointment.people_count}
                                            </span>
                                        )}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {appointment.services_label}
                                        {appointment.estimated_total > 0 &&
                                            ` · ${formatCurrency(appointment.estimated_total)}`}
                                    </p>
                                </div>
                                {appointment.invoice_id ? (
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                        <Badge variant="accent">{appointment.invoice_reference}</Badge>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-8"
                                            onClick={() => openMutation.mutate(appointment.id)}
                                            disabled={openMutation.isPending}
                                        >
                                            Reprendre
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="accent"
                                        className="h-9 shrink-0"
                                        onClick={() => openMutation.mutate(appointment.id)}
                                        disabled={openMutation.isPending}
                                    >
                                        {openMutation.isPending && <Loader2 className="animate-spin" />}
                                        Ouvrir en caisse
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {openMutation.isError && (
                    <p className="text-xs text-destructive">{getErrorMessage(openMutation.error)}</p>
                )}
            </DialogContent>
        </Dialog>
    );
}
