import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Clock3, Loader2, Printer, RotateCcw, X } from 'lucide-react';
import { getErrorMessage, getSettings } from '@/lib/api';
import { getPos2Invoice, pos2Keys, recordPos2Print, refundPos2Invoice } from '@/lib/pos2Api';
import { paymentMethodLabel, printInvoiceReceipt } from '@/lib/receiptV2';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { Pos2InvoiceStatus } from '@/types/pos2';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export const STATUS_META: Record<Pos2InvoiceStatus, { label: string; variant: 'default' | 'accent' | 'success' | 'destructive' | 'outline' }> = {
    draft: { label: 'Brouillon', variant: 'outline' },
    in_progress: { label: 'Ouverte', variant: 'accent' },
    services_done: { label: 'Services terminés', variant: 'accent' },
    pending_payment: { label: 'En caisse', variant: 'accent' },
    paid: { label: 'Payée', variant: 'success' },
    cancelled: { label: 'Annulée', variant: 'destructive' },
    refunded: { label: 'Remboursée', variant: 'destructive' },
};

interface Pos2InvoiceDetailDrawerProps {
    invoiceId: number | null;
    onClose: () => void;
}

/**
 * §35 — full invoice drawer: lignes, remises, paiements, pourboires and the
 * status timeline, plus imprimer / rembourser (permission-gated).
 */
export function Pos2InvoiceDetailDrawer({ invoiceId, onClose }: Pos2InvoiceDetailDrawerProps) {
    const queryClient = useQueryClient();
    const { hasPermission } = useAuth();
    const canRefund = hasPermission('caisse_v2.refund');
    const [refunding, setRefunding] = useState(false);
    const [refundReason, setRefundReason] = useState('');

    useEffect(() => {
        setRefunding(false);
        setRefundReason('');
    }, [invoiceId]);

    const { data: invoice, isPending } = useQuery({
        queryKey: pos2Keys.invoice(invoiceId ?? 0),
        queryFn: () => getPos2Invoice(invoiceId as number),
        enabled: invoiceId !== null,
    });

    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 5 * 60_000 });

    const refundMutation = useMutation({
        mutationFn: () => refundPos2Invoice(invoiceId as number, refundReason.trim()),
        onSuccess: () => {
            setRefunding(false);
            void queryClient.invalidateQueries({ queryKey: pos2Keys.all });
        },
    });

    function print() {
        if (!invoice) return;
        void recordPos2Print(invoice.id).catch(() => undefined);
        void printInvoiceReceipt(invoice, {
            salonName: settings?.salon_name ?? 'BOGOSLAND',
            footer: settings?.receipt_footer,
            duplicata: invoice.print_count > 0,
        });
    }

    const lineDiscounts = (invoice?.items ?? []).reduce(
        (sum, item) => sum + Math.min(item.discount_amount ?? 0, item.line_total),
        0,
    );

    return (
        <AnimatePresence>
            {invoiceId !== null && (
                <div className="fixed inset-0 z-40 flex justify-end">
                    <motion.button
                        type="button"
                        aria-label="Fermer"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-scrim/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.aside
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                        className="relative flex h-full w-full max-w-md flex-col border-l border-tint/[0.1] bg-background shadow-soft-lg"
                    >
                        <div className="flex items-center justify-between gap-2 border-b border-tint/[0.06] px-4 py-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">
                                    {invoice?.reference ?? '…'}
                                </p>
                                {invoice && (
                                    <p className="text-[11px] text-muted-foreground">
                                        {invoice.client_name ?? 'Client de passage'}
                                    </p>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {invoice && (
                                    <Badge variant={STATUS_META[invoice.status]?.variant ?? 'outline'}>
                                        {STATUS_META[invoice.status]?.label ?? invoice.status}
                                    </Badge>
                                )}
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-sm p-1.5 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                            {isPending || !invoice ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-24 w-full" />
                                    <Skeleton className="h-40 w-full" />
                                </div>
                            ) : (
                                <>
                                    {/* Métadonnées */}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <MetaRow label="Ouverte" value={formatTime(invoice.created_at)} />
                                        <MetaRow
                                            label="Encaissée"
                                            value={invoice.confirmed_at ? formatTime(invoice.confirmed_at) : '—'}
                                        />
                                        <MetaRow label="Caissier" value={invoice.confirmed_by ?? invoice.created_by ?? '—'} />
                                        <MetaRow
                                            label="Paiement"
                                            value={paymentMethodLabel(invoice.payment_method)}
                                        />
                                    </div>

                                    <Separator />

                                    {/* Lignes */}
                                    <ul className="space-y-2">
                                        {(invoice.items ?? []).map((item) => {
                                            const discount = Math.min(item.discount_amount ?? 0, item.line_total);
                                            return (
                                                <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-foreground">
                                                            {item.label}
                                                            {item.quantity > 1 && ` ×${item.quantity}`}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {[item.employee_name, item.beneficiary_name]
                                                                .filter(Boolean)
                                                                .join(' — ') || '—'}
                                                            {item.is_free && ' · Abonnement'}
                                                            {discount > 0 && ` · Remise −${formatCurrency(discount)}`}
                                                        </p>
                                                    </div>
                                                    <span className="shrink-0 tabular-nums font-medium text-foreground">
                                                        {item.is_free ? '0' : formatCurrency(item.line_total - discount)}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>

                                    <Separator />

                                    {/* Totaux */}
                                    <div className="space-y-1 text-sm">
                                        <TotalRow label="Sous-total" value={formatCurrency(invoice.subtotal)} muted />
                                        {lineDiscounts > 0 && (
                                            <TotalRow label="Remises lignes" value={`−${formatCurrency(lineDiscounts)}`} accent />
                                        )}
                                        {(invoice.discount_amount ?? 0) > 0 && (
                                            <TotalRow
                                                label={`Remise${invoice.discount_reason ? ` (${invoice.discount_reason})` : ''}`}
                                                value={`−${formatCurrency(invoice.discount_amount ?? 0)}`}
                                                accent
                                            />
                                        )}
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="font-semibold text-foreground">TOTAL</span>
                                            <span className="font-display text-xl font-bold tabular-nums text-accent">
                                                {formatCurrency(invoice.total)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Paiements */}
                                    {(invoice.payment_breakdown ?? []).length > 0 && (
                                        <div className="rounded-md border border-tint/[0.07] bg-tint/[0.02] p-3 text-sm">
                                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                Paiements
                                            </p>
                                            {(invoice.payment_breakdown ?? []).map((row, index) => (
                                                <div key={index} className="flex justify-between text-muted-foreground">
                                                    <span>{paymentMethodLabel(row.method)}</span>
                                                    <span className="tabular-nums">{formatCurrency(row.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {invoice.amount_received !== null && (
                                        <p className="text-xs text-muted-foreground">
                                            Reçu {formatCurrency(invoice.amount_received)} — rendu{' '}
                                            {formatCurrency(invoice.change_given ?? 0)}
                                        </p>
                                    )}

                                    {/* Pourboires */}
                                    {(invoice.tips ?? []).length > 0 && (
                                        <div className="rounded-md border border-tint/[0.07] bg-tint/[0.02] p-3 text-sm">
                                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                Pourboires
                                            </p>
                                            {(invoice.tips ?? []).map((tip) => (
                                                <div
                                                    key={tip.id}
                                                    className={cn(
                                                        'flex justify-between text-muted-foreground',
                                                        tip.voided && 'line-through opacity-60',
                                                    )}
                                                >
                                                    <span>{tip.employee_name ?? `Employé #${tip.employee_id}`}</span>
                                                    <span className="tabular-nums">{formatCurrency(tip.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {(invoice.cancel_reason || invoice.refund_reason) && (
                                        <p className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive">
                                            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                                            {invoice.refund_reason ?? invoice.cancel_reason}
                                        </p>
                                    )}

                                    {/* Historique (§35) */}
                                    {(invoice.status_logs ?? []).length > 0 && (
                                        <div>
                                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                Historique
                                            </p>
                                            <ul className="space-y-1.5">
                                                {(invoice.status_logs ?? []).map((log, index) => (
                                                    <li key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Clock3 className="h-3 w-3 shrink-0 text-accent/70" />
                                                        <span className="tabular-nums">{formatTime(log.created_at)}</span>
                                                        <span>
                                                            {STATUS_META[log.to_status as Pos2InvoiceStatus]?.label ?? log.to_status}
                                                            {log.user_name && ` — ${log.user_name}`}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Actions */}
                        {invoice && (
                            <div className="space-y-2 border-t border-tint/[0.06] px-4 py-3">
                                {refunding ? (
                                    <div className="space-y-2">
                                        <Input
                                            value={refundReason}
                                            onChange={(event) => setRefundReason(event.target.value)}
                                            placeholder="Motif du remboursement (obligatoire)"
                                            className="h-9"
                                            autoFocus
                                        />
                                        {refundMutation.isError && (
                                            <p className="text-xs text-destructive">
                                                {getErrorMessage(refundMutation.error)}
                                            </p>
                                        )}
                                        <div className="flex justify-end gap-2">
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setRefunding(false)}>
                                                Retour
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="sm"
                                                disabled={!refundReason.trim() || refundMutation.isPending}
                                                onClick={() => refundMutation.mutate()}
                                            >
                                                {refundMutation.isPending && <Loader2 className="animate-spin" />}
                                                Confirmer le remboursement
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        {invoice.status === 'paid' && (
                                            <Button type="button" variant="outline" className="flex-1" onClick={print}>
                                                <Printer />
                                                Imprimer
                                            </Button>
                                        )}
                                        {invoice.status === 'paid' && canRefund && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="flex-1 text-destructive hover:text-destructive"
                                                onClick={() => setRefunding(true)}
                                            >
                                                <RotateCcw />
                                                Rembourser
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.aside>
                </div>
            )}
        </AnimatePresence>
    );
}

function MetaRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-sm border border-tint/[0.06] bg-tint/[0.02] px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate font-medium text-foreground">{value}</p>
        </div>
    );
}

function TotalRow({ label, value, muted, accent }: { label: string; value: string; muted?: boolean; accent?: boolean }) {
    return (
        <div className={cn('flex justify-between', muted && 'text-muted-foreground', accent && 'text-accent')}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}
