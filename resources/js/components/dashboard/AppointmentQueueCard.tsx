import { CalendarX2 } from 'lucide-react';
import type { QueuedAppointment } from '@/types/dashboard';
import { useI18n } from '@/lib/i18n';
import { cn, formatTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { EmptyState } from './EmptyState';

/** Maps free-form backend statuses onto the badge palette. */
function statusVariant(status: string): BadgeProps['variant'] {
    const value = status.toLowerCase();
    if (['completed', 'terminé', 'termine', 'done', 'paid'].includes(value)) return 'success';
    if (['cancelled', 'canceled', 'annulé', 'annule', 'no_show', 'refused'].includes(value))
        return 'destructive';
    if (['confirmed', 'confirmé', 'confirme', 'in_progress', 'en_cours'].includes(value))
        return 'accent';
    return 'default';
}

const statusLabels: Record<string, string> = {
    pending: 'En attente',
    confirmed: 'Confirmé',
    in_progress: 'En cours',
    completed: 'Terminé',
    cancelled: 'Annulé',
    canceled: 'Annulé',
    no_show: 'Absent',
    refused: 'Refusé',
    paid: 'Payé',
};

function statusLabel(status: string): string {
    return statusLabels[status.toLowerCase()] ?? status;
}

export function AppointmentQueueCard({ appointments }: { appointments: QueuedAppointment[] }) {
    const { t } = useI18n();
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('File d’attente')}</CardTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Les rendez-vous d’aujourd’hui')}
                </p>
            </CardHeader>

            <CardContent>
                {appointments.length === 0 ? (
                    <EmptyState
                        icon={CalendarX2}
                        title={t('Journée libre')}
                        description={t('Aucun rendez-vous n’est programmé pour aujourd’hui.')}
                    />
                ) : (
                    <ul className="divide-y divide-tint/[0.06]">
                        {appointments.map((appointment) => (
                            <li
                                key={appointment.id}
                                className={cn(
                                    'flex items-center gap-3.5 py-3 first:pt-0 last:pb-0',
                                    '-mx-2 rounded-md px-2 transition-colors duration-200 hover:bg-tint/[0.03]',
                                )}
                            >
                                <span className="w-11 shrink-0 text-sm font-semibold tabular-nums text-foreground">
                                    {formatTime(appointment.starts_at)}
                                </span>

                                <span
                                    aria-hidden
                                    className="h-8 w-[3px] shrink-0 rounded-full"
                                    style={{ backgroundColor: appointment.service_color }}
                                />

                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {appointment.client_name}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {appointment.service_name} · {appointment.employee_name}
                                    </p>
                                </div>

                                <Badge variant={statusVariant(appointment.status)} className="shrink-0">
                                    {t(statusLabel(appointment.status))}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
