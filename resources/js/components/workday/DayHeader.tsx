import { motion } from 'framer-motion';
import { CalendarDays, Lock, Receipt, Users, Wallet } from 'lucide-react';
import type { WorkDay } from '@/types/workday';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDayLabel } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmployeeAvatar } from './EmployeeAvatar';

interface DayHeaderProps {
    workDay: WorkDay;
    /** Running totals derived from the live ledger, not a separate request. */
    revenueSoFar: number;
    salesCount: number;
    onClose: () => void;
}

function Stat({
    icon: Icon,
    label,
    value,
    accent = false,
}: {
    icon: typeof Wallet;
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <div className="flex items-center gap-2.5">
            <span
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1',
                    accent
                        ? 'bg-accent/[0.10] ring-accent/15'
                        : 'bg-tint/[0.04] ring-tint/[0.06]',
                )}
            >
                <Icon className={cn('h-4 w-4', accent ? 'text-accent' : 'text-muted-foreground')} />
            </span>
            <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {label}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">
                    {value}
                </p>
            </div>
        </div>
    );
}

/** Persistent status bar for the open day, pinned above the checkout. */
export function DayHeader({ workDay, revenueSoFar, salesCount, onClose }: DayHeaderProps) {
    const { t } = useI18n();
    const present = workDay.employees.filter((employee) => employee.present);

    return (
        <Card className="relative overflow-hidden p-5">
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/[0.06] via-transparent to-transparent" />

            <div className="relative flex flex-wrap items-start justify-between gap-x-6 gap-y-5">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-lg font-semibold tracking-tight">
                            {t('Journée du {date}', { date: formatDayLabel(workDay.date) })}
                        </h2>
                        <Badge variant="success" className="gap-1.5">
                            <motion.span
                                aria-hidden
                                className="h-1.5 w-1.5 rounded-full bg-success"
                                animate={{ opacity: [1, 0.25, 1] }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            {t('Ouverte')}
                        </Badge>
                    </div>

                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {workDay.opened_by
                            ? t('Ouvert par {name}', { name: workDay.opened_by.name })
                            : t('Ouverture enregistrée')}
                        {workDay.notes && (
                            <>
                                <span aria-hidden className="text-muted-foreground/40">
                                    •
                                </span>
                                <span className="truncate">{workDay.notes}</span>
                            </>
                        )}
                    </p>

                    {present.length > 0 && (
                        <div className="mt-3 flex items-center gap-2">
                            <div className="flex -space-x-2">
                                {present.slice(0, 6).map((employee) => (
                                    <EmployeeAvatar
                                        key={employee.id}
                                        name={employee.name}
                                        color={employee.avatar_color}
                                        size="sm"
                                        className="ring-2 ring-card"
                                    />
                                ))}
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {present.length} {t('en service')}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                    <Stat
                        icon={Wallet}
                        label={t('Solde initial')}
                        value={formatCurrency(workDay.opening_balance, {
                            maximumFractionDigits: 2,
                        })}
                    />
                    <Stat
                        icon={Receipt}
                        label={t('Encaissé')}
                        value={formatCurrency(revenueSoFar, { maximumFractionDigits: 2 })}
                        accent
                    />
                    <Stat icon={Users} label={t('Tickets')} value={String(salesCount)} />

                    <Button variant="outline" onClick={onClose}>
                        <Lock />
                        {t('Clôturer la journée')}
                    </Button>
                </div>
            </div>
        </Card>
    );
}
