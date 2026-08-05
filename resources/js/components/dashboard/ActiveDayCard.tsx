import { motion } from 'framer-motion';
import { ArrowRight, HandCoins, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ActiveDaySummary } from '@/types/dashboard';
import { cn, formatCurrency, formatDayLabel } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Figure({
    icon: Icon,
    label,
    value,
    tone = 'default',
}: {
    icon: typeof Wallet;
    label: string;
    value: string;
    tone?: 'default' | 'accent' | 'success' | 'destructive';
}) {
    return (
        <div className="rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-3">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {label}
            </span>
            <p
                className={cn(
                    'mt-1.5 text-base font-semibold leading-none tabular-nums',
                    tone === 'accent' && 'text-accent',
                    tone === 'success' && 'text-success',
                    tone === 'destructive' && 'text-destructive',
                    tone === 'default' && 'text-foreground',
                )}
            >
                {value}
            </p>
        </div>
    );
}

/** Live mirror of the open work day. Rendered only when `active_day` is present. */
export function ActiveDayCard({ day }: { day: ActiveDaySummary }) {
    return (
        <Card className="relative overflow-hidden">
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/[0.07] via-transparent to-transparent" />

            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                    <CardTitle>Journée en cours</CardTitle>
                    <Badge variant="success" className="gap-1.5">
                        <motion.span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full bg-success"
                            animate={{ opacity: [1, 0.25, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        Ouverte
                    </Badge>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {formatDayLabel(day.date)} · {day.employees_present} employé
                    {day.employees_present > 1 ? 's' : ''} en service · fond de caisse{' '}
                    {formatCurrency(day.opening_balance, { maximumFractionDigits: 2 })}
                </p>
            </CardHeader>

            <CardContent className="relative">
                {/* Commissions are a monthly payroll concern (see "Paie"), not a
                    daily one — showing a running commission figure here read as
                    money owed today, when it's really only settled at month-end.
                    It still reduces "Bénéfice estimé" below; the day-by-day detail
                    lives on the Caisse page's journée report instead. */}
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                    <Figure
                        icon={Wallet}
                        label="Encaissé"
                        value={formatCurrency(day.revenue_so_far, { maximumFractionDigits: 2 })}
                        tone="accent"
                    />
                    <Figure
                        icon={Receipt}
                        label="Dépenses"
                        value={formatCurrency(day.expenses_so_far, { maximumFractionDigits: 2 })}
                        tone="destructive"
                    />
                    <Figure
                        icon={HandCoins}
                        label="Avances"
                        value={formatCurrency(day.advances_so_far, { maximumFractionDigits: 2 })}
                        tone="destructive"
                    />
                    <Figure
                        icon={TrendingUp}
                        label="Bénéfice estimé"
                        value={formatCurrency(day.estimated_profit, { maximumFractionDigits: 2 })}
                        tone={day.estimated_profit >= 0 ? 'success' : 'destructive'}
                    />
                </div>

                <Button asChild variant="outline" className="mt-4 w-full sm:w-auto">
                    <Link to="/pos">
                        Ouvrir la caisse
                        <ArrowRight />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}
