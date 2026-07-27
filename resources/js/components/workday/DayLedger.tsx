import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ReceiptText } from 'lucide-react';
import { getTransactions } from '@/lib/api';
import { workDayKeys } from '@/hooks/useWorkDay';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import type { Sale } from '@/types/workday';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { getCategory } from './categories';
import { EmployeeAvatar } from './EmployeeAvatar';

interface DayLedgerProps {
    workDayId: number;
}

function clientName(sale: Sale): string {
    if (sale.client) return sale.client.name;
    if (sale.client_label) return sale.client_label;
    return 'Client de passage';
}

/** The running list of the day's encaissements, newest first. */
export function DayLedger({ workDayId }: DayLedgerProps) {
    const { data: sales, isPending } = useQuery({
        queryKey: workDayKeys.transactions(workDayId),
        queryFn: () => getTransactions(workDayId),
        refetchInterval: 8000,
    });

    const total = (sales ?? []).reduce((sum, sale) => sum + sale.total, 0);

    return (
        <Card className="flex h-full flex-col">
            <CardHeader>
                <div className="flex items-baseline justify-between gap-3">
                    <CardTitle>Encaissements du jour</CardTitle>
                    {!isPending && (sales?.length ?? 0) > 0 && (
                        <span className="text-sm font-semibold tabular-nums text-accent">
                            {formatCurrency(total, { maximumFractionDigits: 2 })}
                        </span>
                    )}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {isPending
                        ? 'Chargement…'
                        : `${sales?.length ?? 0} ticket${(sales?.length ?? 0) > 1 ? 's' : ''} enregistré${(sales?.length ?? 0) > 1 ? 's' : ''}`}
                </p>
            </CardHeader>

            <CardContent className="flex-1">
                {isPending ? (
                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <div key={index} className="flex items-center gap-3">
                                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-2/5" />
                                    <Skeleton className="h-3 w-3/5" />
                                </div>
                                <Skeleton className="h-4 w-16" />
                            </div>
                        ))}
                    </div>
                ) : (sales ?? []).length === 0 ? (
                    <EmptyState
                        icon={ReceiptText}
                        title="Aucun encaissement"
                        description="Les tickets de la journée s’afficheront ici dès le premier enregistrement."
                    />
                ) : (
                    <ul className="max-h-[560px] space-y-2 overflow-y-auto pr-0.5">
                        <AnimatePresence initial={false}>
                            {(sales ?? []).map((sale) => {
                                const config = getCategory(sale.category);
                                return (
                                    <motion.li
                                        key={sale.id}
                                        layout
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                                        className={cn(
                                            'flex items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5',
                                            'transition-colors duration-200 hover:border-accent/20 hover:bg-white/[0.04]',
                                        )}
                                    >
                                        <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground/80">
                                            {formatTime(sale.created_at)}
                                        </span>

                                        <EmployeeAvatar
                                            name={sale.employee.name}
                                            color={sale.employee.avatar_color}
                                            size="sm"
                                        />

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={cn(
                                                        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em]',
                                                        config.badge,
                                                    )}
                                                >
                                                    {config.label}
                                                </span>
                                                <span className="truncate text-sm font-medium text-foreground">
                                                    {sale.items.length > 0
                                                        ? sale.items
                                                              .map((item) =>
                                                                  item.quantity > 1
                                                                      ? `${item.label} ×${item.quantity}`
                                                                      : item.label,
                                                              )
                                                              .join(', ')
                                                        : config.label}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {clientName(sale)} · {sale.employee.name}
                                            </p>
                                        </div>

                                        <div className="shrink-0 text-right">
                                            <p className="text-sm font-semibold tabular-nums text-foreground">
                                                {formatCurrency(sale.total, {
                                                    maximumFractionDigits: 2,
                                                })}
                                            </p>
                                            {sale.commission_amount !== null &&
                                                sale.commission_amount > 0 && (
                                                    <p className="mt-0.5 text-[11px] tabular-nums text-accent">
                                                        +
                                                        {formatCurrency(sale.commission_amount, {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </p>
                                                )}
                                        </div>
                                    </motion.li>
                                );
                            })}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
