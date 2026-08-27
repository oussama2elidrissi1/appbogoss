import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Printer, ReceiptText, Trash2 } from 'lucide-react';
import { deleteTransaction, getTransactions, recordTransactionPrint } from '@/lib/api';
import { printEmployeeDailySummary, printSaleReceipt } from '@/lib/receipt';
import { workDayKeys } from '@/hooks/useWorkDay';
import { t as translate, useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import type { Sale } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { getCategory } from './categories';
import { EmployeeAvatar } from './EmployeeAvatar';

interface DayLedgerProps {
    workDayId: number;
    /** 'YYYY-MM-DD' — printed on the employee's daily total ticket. */
    date: string;
}

interface EmployeeSalesSummary {
    id: number;
    name: string;
    avatarColor: string;
    salesCount: number;
    performedCount: number;
    total: number;
    commissionTotal: number;
}

function clientName(sale: Sale): string {
    if (sale.client) return sale.client.name;
    if (sale.client_label) return sale.client_label;
    return translate('Client de passage');
}

/** The running list of the day's encaissements, newest first. */
export function DayLedger({ workDayId, date }: DayLedgerProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [deletingSale, setDeletingSale] = useState<Sale | null>(null);
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
            void queryClient.invalidateQueries({ queryKey: ['products'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
    });

    const printMutation = useMutation({
        mutationFn: recordTransactionPrint,
        onSuccess: (printedSale) => {
            updateSaleInCache(printedSale);
            void printSaleReceipt(printedSale, { duplicata: printedSale.print_count > 1 });
        },
    });

    const activeSales = (sales ?? []).filter((sale) => !sale.is_deleted);
    const deletedCount = (sales ?? []).length - activeSales.length;
    const total = activeSales.reduce((sum, sale) => sum + sale.total, 0);
    const salesByEmployee = Array.from(
        activeSales
            .reduce((summaries, sale) => {
                const breakdown = sale.employee_breakdown !== undefined
                    ? sale.employee_breakdown
                    : [{
                        employee_id: sale.employee.id,
                        employee_name: sale.employee.name,
                        employee_avatar_color: sale.employee.avatar_color,
                        tickets_count: 1,
                        performed_count: Math.max(1, sale.items.reduce((sum, item) => sum + item.quantity, 0)),
                        sales_count: 0,
                        total: sale.total,
                        commission: sale.commission_amount ?? 0,
                    }];

                for (const row of breakdown) {
                    const current = summaries.get(row.employee_id) ?? {
                        id: row.employee_id,
                        name: row.employee_name,
                        avatarColor: row.employee_avatar_color ?? '#C8A24C',
                        salesCount: 0,
                        performedCount: 0,
                        total: 0,
                        commissionTotal: 0,
                    };

                    current.salesCount += row.tickets_count;
                    current.performedCount += row.performed_count;
                    current.total += row.total;
                    current.commissionTotal += row.commission;
                    summaries.set(row.employee_id, current);
                }

                return summaries;
            }, new Map<number, EmployeeSalesSummary>())
            .values(),
    ).sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'fr'));

    function handleDelete(sale: Sale) {
        setDeletingSale(sale);
    }

    function confirmDelete() {
        if (!deletingSale) return;
        deleteMutation.mutate(deletingSale.id, { onSuccess: () => setDeletingSale(null) });
    }

    function handleReprint(sale: Sale) {
        if (printMutation.isPending) return;
        printMutation.mutate(sale.id);
    }

    function handlePrintEmployeeTotal(employee: EmployeeSalesSummary) {
        printEmployeeDailySummary({
            employeeName: employee.name,
            date,
            salesCount: employee.performedCount,
            total: employee.total,
            commissionTotal: employee.commissionTotal,
        });
    }

    return (
        <>
        <Card className="flex h-full flex-col">
            <CardHeader>
                <div className="flex items-baseline justify-between gap-3">
                    <CardTitle>{t('Encaissements du jour')}</CardTitle>
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
                        ? t('Chargement...')
                        : `${activeSales.length} ${t(activeSales.length > 1 ? 'tickets enregistrés' : 'ticket enregistré')}${deletedCount > 0 ? ` · ${deletedCount} ${t(deletedCount > 1 ? 'supprimés' : 'supprimé')}` : ''}`}
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
                        title={t('Aucun encaissement')}
                        description={t("Les tickets de la journée s'afficheront ici dès le premier enregistrement.")}
                    />
                ) : (
                    <div className="space-y-4">
                        {salesByEmployee.length > 0 && (
                            <section className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        {t('Par employé')}
                                    </h3>
                                    <span className="text-xs text-muted-foreground">
                                        {t('Hors tickets supprimés')}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {salesByEmployee.map((employee) => (
                                        <div
                                            key={employee.id}
                                            className="flex items-center gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.025] px-3 py-2.5"
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
                                                    {employee.performedCount}{' '}
                                                    {t(employee.performedCount > 1 ? 'prestations' : 'prestation')}
                                                </p>
                                            </div>

                                            <p className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                                                {formatCurrency(employee.total, {
                                                    maximumFractionDigits: 2,
                                                })}
                                            </p>

                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                aria-label={t('Imprimer le total du jour de {name}', { name: employee.name })}
                                                className="h-8 w-8 shrink-0"
                                                onClick={() => handlePrintEmployeeTotal(employee)}
                                            >
                                                <Printer className="text-muted-foreground" />
                                            </Button>
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
                                                'flex items-center gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2.5',
                                                'transition-colors duration-200 hover:border-accent/20 hover:bg-tint/[0.04]',
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
                                                        {t(config.label)}
                                                    </span>
                                                    {deleted && (
                                                        <Badge variant="destructive">
                                                            {t('Supprimé')}
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
                                                            : t(config.label)}
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
                                                    {sale.printed_ticket_count ?? sale.print_count * 2} {t('tickets')}
                                                    {' '}· {sale.print_count} {t('impr.')}
                                                </p>
                                            </div>

                                            {!deleted && (
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label={t('Réimprimer le ticket')}
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
                                                        aria-label={t('Supprimer le ticket')}
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

        <ConfirmDialog
            open={deletingSale !== null}
            onOpenChange={(open) => { if (!open) setDeletingSale(null); }}
            title={t('Supprimer ce ticket ?')}
            description={
                deletingSale
                    ? t('Le ticket "{label}" sera annulé et retiré du chiffre d\'affaires du jour.', {
                          label: deletingSale.items[0]?.label ?? `#${deletingSale.id}`,
                      })
                    : undefined
            }
            confirmLabel={t('Supprimer')}
            loading={deleteMutation.isPending}
            onConfirm={confirmDelete}
        />
        </>
    );
}
