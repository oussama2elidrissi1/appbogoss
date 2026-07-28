import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Printer, ReceiptText, Trash2 } from 'lucide-react';
import { deleteTransaction, getTransactions, recordTransactionPrint } from '@/lib/api';
import { printSaleReceipt } from '@/lib/receipt';
import { workDayKeys } from '@/hooks/useWorkDay';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import type { Sale } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { getCategory } from './categories';
import { EmployeeAvatar } from './EmployeeAvatar';

interface DayLedgerProps {
    workDayId: number;
}

interface EmployeeSalesSummary {
    id: number;
    name: string;
    avatarColor: string;
    salesCount: number;
    total: number;
}

function clientName(sale: Sale): string {
    if (sale.client) return sale.client.name;
    if (sale.client_label) return sale.client_label;
    return 'Client de passage';
}

/** The running list of the day's encaissements, newest first. */
export function DayLedger({ workDayId }: DayLedgerProps) {
    const queryClient = useQueryClient();
    const { data: sales, isPending } = useQuery({
        queryKey: workDayKeys.transactions(workDayId),
        queryFn: () => getTransactions(workDayId),
        refetchInterval: 8000,
    });

    function updateSaleInCache(nextSale: Sale) {
        queryClient.setQueryData<Sale[]>(
            workDayKeys.transactions(workDayId),
            (current) =>
                current?.map((sale) => (sale.id === nextSale.id ? nextSale : sale)) ?? [nextSale],
        );
    }

    const deleteMutation = useMutation({
        mutationFn: deleteTransaction,
        onSuccess: (deletedSale) => {
            updateSaleInCache(deletedSale);
            void queryClient.invalidateQueries({
                queryKey: workDayKeys.transactions(workDayId),
            });
            void queryClient.invalidateQueries({
                queryKey: workDayKeys.active,
            });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
    });

    const printMutation = useMutation({
        mutationFn: recordTransactionPrint,
        onSuccess: (printedSale) => {
            updateSaleInCache(printedSale);
            printSaleReceipt(printedSale);
        },
    });

    const activeSales = (sales ?? []).filter((sale) => !sale.is_deleted);
    const deletedCount = (sales ?? []).length - activeSales.length;
    const total = activeSales.reduce((sum, sale) => sum + sale.total, 0);
    const salesByEmployee = Array.from(
        activeSales
            .reduce((summaries, sale) => {
                const current = summaries.get(sale.employee.id) ?? {
                    id: sale.employee.id,
                    name: sale.employee.name,
                    avatarColor: sale.employee.avatar_color,
                    salesCount: 0,
                    total: 0,
                };

                current.salesCount += 1;
                current.total += sale.total;
                summaries.set(sale.employee.id, current);

                return summaries;
            }, new Map<number, EmployeeSalesSummary>())
            .values(),
    ).sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'fr'));

    function handleDelete(sale: Sale) {
        const label = sale.items[0]?.label ?? `ticket #${sale.id}`;
        const confirmed = window.confirm(`Supprimer le ticket "${label}" ?`);
        if (confirmed) deleteMutation.mutate(sale.id);
    }

    function handleReprint(sale: Sale) {
        if (printMutation.isPending) return;
        printMutation.mutate(sale.id);
    }

    return (
        <Card className="flex h-full flex-col">
            <CardHeader>
                <div className="flex items-baseline justify-between gap-3">
                    <CardTitle>Encaissements du jour</CardTitle>
                    {!isPending && activeSales.length > 0 && (
                        <span className="text-sm font-semibold tabular-nums text-accent">
                            {formatCurrency(total, {
                                maximumFractionDigits: 2,
                            })}
                        </span>
                    )}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {isPending
                        ? 'Chargement...'
                        : `${activeSales.length} ticket${activeSales.length > 1 ? 's' : ''} enregistré${activeSales.length > 1 ? 's' : ''}${deletedCount > 0 ? ` · ${deletedCount} supprimé${deletedCount > 1 ? 's' : ''}` : ''}`}
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
                        description="Les tickets de la journée s'afficheront ici dès le premier enregistrement."
                    />
                ) : (
                    <div className="space-y-4">
                        {salesByEmployee.length > 0 && (
                            <section className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        Par employé
                                    </h3>
                                    <span className="text-xs text-muted-foreground">
                                        Hors tickets supprimés
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {salesByEmployee.map((employee) => (
                                        <div
                                            key={employee.id}
                                            className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2.5"
                                        >
                                            <EmployeeAvatar
                                                name={employee.name}
                                                color={employee.avatarColor}
                                                size="sm"
                                            />

                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {employee.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {employee.salesCount} ticket
                                                    {employee.salesCount > 1 ? 's' : ''}
                                                </p>
                                            </div>

                                            <p className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                                                {formatCurrency(employee.total, {
                                                    maximumFractionDigits: 2,
                                                })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-0.5">
                            <AnimatePresence initial={false}>
                                {(sales ?? []).map((sale) => {
                                    const config = getCategory(sale.category);
                                    const deleted = sale.is_deleted;

                                    return (
                                        <motion.li
                                            key={sale.id}
                                            layout
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{
                                                duration: 0.25,
                                                ease: [0.4, 0, 0.2, 1],
                                            }}
                                            className={cn(
                                                'flex items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5',
                                                'transition-colors duration-200 hover:border-accent/20 hover:bg-white/[0.04]',
                                                deleted &&
                                                    'border-destructive/20 bg-destructive/[0.06] opacity-80 hover:border-destructive/30',
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
                                                    {deleted && (
                                                        <Badge variant="destructive">
                                                            Supprimé
                                                        </Badge>
                                                    )}
                                                    <span
                                                        className={cn(
                                                            'truncate text-sm font-medium text-foreground',
                                                            deleted && 'text-muted-foreground',
                                                        )}
                                                    >
                                                        {sale.items.length > 0
                                                            ? sale.items
                                                                  .map((item) =>
                                                                      item.quantity > 1
                                                                          ? `${item.label} x${item.quantity}`
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
                                                <p
                                                    className={cn(
                                                        'text-sm font-semibold tabular-nums text-foreground',
                                                        deleted &&
                                                            'text-muted-foreground line-through decoration-destructive/70',
                                                    )}
                                                >
                                                    {formatCurrency(sale.total, {
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </p>
                                                {!deleted &&
                                                    sale.commission_amount !== null &&
                                                    sale.commission_amount > 0 && (
                                                        <p className="mt-0.5 text-[11px] tabular-nums text-accent">
                                                            +
                                                            {formatCurrency(
                                                                sale.commission_amount,
                                                                {
                                                                    maximumFractionDigits: 2,
                                                                },
                                                            )}
                                                        </p>
                                                    )}
                                                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                                    {sale.print_count} impr.
                                                </p>
                                            </div>

                                            {!deleted && (
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label="Réimprimer le ticket"
                                                        disabled={printMutation.isPending}
                                                        onClick={() => handleReprint(sale)}
                                                        className="h-8 w-8"
                                                    >
                                                        <Printer className="text-muted-foreground" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label="Supprimer le ticket"
                                                        disabled={deleteMutation.isPending}
                                                        onClick={() => handleDelete(sale)}
                                                        className="h-8 w-8"
                                                    >
                                                        <Trash2 className="text-destructive" />
                                                    </Button>
                                                </div>
                                            )}
                                        </motion.li>
                                    );
                                })}
                            </AnimatePresence>
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
