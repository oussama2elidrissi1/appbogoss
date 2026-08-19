import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarCheck, CalendarPlus, CalendarX, CheckCheck, MessageCircle, type LucideIcon } from 'lucide-react';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/api';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function idOf(data: Record<string, unknown>, key: string): number | undefined {
    return typeof data[key] === 'number' ? (data[key] as number) : undefined;
}

/** §34/§25 — booking-review and support-chat notification types, each pointing at where the reader should land. */
const NOTIFICATION_ROUTES: Partial<Record<string, (data: Record<string, unknown>) => string>> = {
    partner_booking_created: () => '/partner-reservations',
    proposal_accepted: () => '/partner-reservations',
    proposal_declined: () => '/partner-reservations',
    booking_confirmed: (d) => {
        const id = idOf(d, 'appointment_id');
        return id ? `/partner/reservations/${id}` : '/partner/reservations';
    },
    booking_refused: (d) => {
        const id = idOf(d, 'appointment_id');
        return id ? `/partner/reservations/${id}` : '/partner/reservations';
    },
    alternate_proposed: (d) => {
        const id = idOf(d, 'appointment_id');
        return id ? `/partner/reservations/${id}` : '/partner/reservations';
    },
    support_message_from_partner: () => '/support-inbox',
    support_message_from_staff: () => '/partner/support',
};

const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
    partner_booking_created: CalendarPlus,
    proposal_accepted: CalendarCheck,
    proposal_declined: CalendarX,
    booking_confirmed: CalendarCheck,
    booking_refused: CalendarX,
    alternate_proposed: CalendarPlus,
    support_message_from_partner: MessageCircle,
    support_message_from_staff: MessageCircle,
};

export function NotificationsBell() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { data } = useQuery({
        queryKey: ['notifications'],
        queryFn: getNotifications,
        refetchInterval: 20_000,
    });

    const notifications = data?.data ?? [];
    const unreadCount = data?.unread_count ?? 0;

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Notifications"
                    className="relative rounded-md p-2.5 text-muted-foreground transition-colors duration-200 hover:bg-tint/[0.05] hover:text-foreground"
                >
                    <Bell className="h-[18px] w-[18px]" />
                    {unreadCount > 0 && (
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />
                    )}
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-normal text-accent hover:underline"
                            onClick={() => void markAllNotificationsRead().then(invalidate)}
                        >
                            <CheckCheck className="h-3 w-3" />
                            Tout marquer lu
                        </button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {notifications.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                        Aucune notification pour le moment.
                    </p>
                ) : (
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.map((notification) => {
                            const Icon = NOTIFICATION_ICONS[notification.data.type] ?? Bell;
                            const buildRoute = NOTIFICATION_ROUTES[notification.data.type];

                            return (
                                <button
                                    key={notification.id}
                                    type="button"
                                    onClick={() => {
                                        if (!notification.read_at) {
                                            void markNotificationRead(notification.id).then(invalidate);
                                        }
                                        if (buildRoute) {
                                            navigate(buildRoute(notification.data));
                                        }
                                    }}
                                    className={cn(
                                        'flex w-full items-start gap-2.5 border-b border-tint/[0.05] px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-tint/[0.04]',
                                        !notification.read_at && 'bg-accent/[0.05]',
                                    )}
                                >
                                    {buildRoute && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />}
                                    <span className="min-w-0 flex-1">
                                        <p className="text-foreground">{notification.data.message}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {formatRelativeTime(notification.created_at)}
                                        </p>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
