import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Clock3, FileText, Loader2, Printer, RotateCcw, X } from 'lucide-react';
import { getErrorMessage, getSettings } from '@/lib/api';
import { getCategoryLabel } from '@/components/workday/categories';
import { getPos2Invoice, pos2Keys, recordPos2Print, refundPos2Invoice } from '@/lib/pos2Api';
import { paymentMethodLabel, printInvoiceA4, printInvoiceReceipt } from '@/lib/receiptV2';
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

    function printA4() {
        if (!invoice) return;
        void recordPos2Print(invoice.id).catch(() => undefined);
        void printInvoiceA4(invoice, {
            salon_name: settings?.salon_name,
            salon_phone: settings?.salon_phone,
            salon_email: settings?.salon_email,
            salon_address: settings?.salon_address,
            receipt_footer: settings?.receipt_footer,
            logo_url: settings?.logo_url,
        });
    }

    const lineDiscounts = (invoice?.items ?? []).reduce(
        (sum, item) => sum + Math.min(item.discount_amount ?? 0, item.line_total),
        0,
    );
    const activeTips = (invoice?.tips ?? []).filter((tip) => !tip.voided);
    const tipsTotal = activeTips.reduce((sum, tip) => sum + tip.amount, 0);

    // §25 — commissions agrégées par employé, depuis les lignes (valeurs
    // backend : réelles une fois payée, estimées avant).
    const commissionRecap = (() => {
        const byEmployee = new Map<number, { name: string; amount: number }>();
        for (const item of invoice?.items ?? []) {
            if (item.employee_id === null) continue;
            const amount = item.commission_amount ?? item.estimated_commission ?? 0;
            const entry = byEmployee.get(item.employee_id) ?? {
                name: item.employee_name ?? `Employé #${item.employee_id}`,
                amount: 0,
            };
            entry.amount += amount;
            byEmployee.set(item.employee_id, entry);
        }
        return [...byEmployee.values()];
    })();
    const commissionTotal = commissionRecap.reduce((sum, entry) => sum + entry.amount, 0);
    const canRefundInvoice = invoice?.status === 'paid' && invoice.channel === 'caisse_v2' && canRefund;

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

                                    {/* Services (§25) — chaque ligne dit tout : service,
                                        catégorie, durée, employé, prix, commission, pourboire. */}
                                    <div>
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            Services
                                        </p>
                                        <ul className="space-y-2">
                                            {(invoice.items ?? []).map((item) => {
                                                const discount = Math.min(item.discount_amount ?? 0, item.line_total);
                                                const commission = item.commission_amount ?? item.estimated_commission;
                                                const lineTips = activeTips.filter(
                                                    (tip) => tip.prestation_item_id === item.id,
                                                );
                                                const lineTipTotal = lineTips.reduce((sum, tip) => sum + tip.amount, 0);
                                                return (
                                                    <li
                                                        key={item.id}
                                                        className="rounded-md border border-tint/[0.07] bg-tint/[0.02] p-3"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-semibold text-foreground">
                                                                    {item.label}
                                                                    {item.quantity > 1 && ` ×${item.quantity}`}
                                                                </p>
                                                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                                    {[
                                                                        item.category ? getCategoryLabel(item.category) : null,
                                                                        item.duration_minutes ? `${item.duration_minutes} min` : null,
                                                                        item.beneficiary_name ? `Pour ${item.beneficiary_name}` : null,
                                                                        item.is_free ? 'Couvert par abonnement' : null,
                                                                    ]
                                                                        .filter(Boolean)
                                                                        .join(' · ')}
                                                                </p>
                                                            </div>
                                                            <div className="shrink-0 text-right">
                                                                <p className="text-sm font-semibold tabular-nums text-foreground">
                                                                    {item.is_free ? '0' : formatCurrency(item.line_total - discount)}
                                                                </p>
                                                                {item.is_free && item.public_price !== null && (
                                                                    <p className="text-[11px] tabular-nums text-muted-foreground line-through">
                                                                        {formatCurrency(item.public_price)}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-tint/[0.06] pt-2 text-[11px] sm:grid-cols-3">
                                                            <span className="text-muted-foreground">
                                                                Employé{' '}
                                                                <span className="font-medium text-foreground">
                                                                    {item.employee_name ?? '—'}
                                                                </span>
                                                            </span>
                                                            <span className="text-muted-foreground">
                                                                Commission{' '}
                                                                <span className="font-medium text-accent">
                                                                    {commission != null ? formatCurrency(commission) : '—'}
                                                                </span>
                                                            </span>
                                                            <span className="text-muted-foreground">
                                                                Pourboire{' '}
                                                                <span className={cn('font-medium', lineTipTotal > 0 ? 'text-success' : 'text-foreground')}>
                                                                    {lineTipTotal > 0 ? formatCurrency(lineTipTotal) : '—'}
                                                                </span>
                                                            </span>
                                                            {discount > 0 && (
                                                                <span className="text-accent">Remise −{formatCurrency(discount)}</span>
                                                            )}
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>

                                    <Separator />

                                    {/* Finances (§25) */}
                                    <div>
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            Finances
                                        </p>
                                        <div className="space-y-1 text-sm">
                                            <TotalRow label="Sous-total services" value={formatCurrency(invoice.subtotal)} muted />
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
                                                <span className="font-semibold text-foreground">TOTAL ENCAISSÉ</span>
                                                <span className="font-display text-xl font-bold tabular-nums text-accent">
                                                    {formatCurrency(invoice.total)}
                                                </span>
                                            </div>
                                            {tipsTotal > 0 && (
                                                <p className="pt-0.5 text-[11px] text-muted-foreground">
                                                    + {formatCurrency(tipsTotal)} de pourboires — remis directement aux
                                                    employés, hors total facture.
                                                </p>
                                            )}
                                        </div>
                                        {(invoice.payment_breakdown ?? []).length > 0 && (
                                            <div className="mt-2 rounded-md border border-tint/[0.07] bg-tint/[0.02] p-2.5 text-xs">
                                                {(invoice.payment_breakdown ?? []).map((row, index) => (
                                                    <div key={index} className="flex justify-between text-muted-foreground">
                                                        <span>{paymentMethodLabel(row.method)}</span>
                                                        <span className="tabular-nums">{formatCurrency(row.amount)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {invoice.amount_received !== null && (
                                            <p className="mt-1.5 text-xs text-muted-foreground">
                                                Reçu {formatCurrency(invoice.amount_received)} — rendu{' '}
                                                {formatCurrency(invoice.change_given ?? 0)}
                                            </p>
                                        )}
                                    </div>

                                    {/* Commissions (§25) */}
                                    {commissionRecap.length > 0 && (
                                        <div className="rounded-md border border-tint/[0.07] bg-tint/[0.02] p-3 text-sm">
                                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                Commissions employés
                                                {invoice.status !== 'paid' && invoice.status !== 'refunded' && ' (estimation)'}
                                            </p>
                                            {commissionRecap.map((entry) => (
                                                <div key={entry.name} className="flex justify-between text-muted-foreground">
                                                    <span>{entry.name}</span>
                                                    <span className="tabular-nums text-accent">{formatCurrency(entry.amount)}</span>
                                                </div>
                                            ))}
                                            {commissionRecap.length > 1 && (
                                                <div className="mt-1.5 flex justify-between border-t border-tint/[0.06] pt-1.5 font-semibold text-foreground">
                                                    <span>Total</span>
                                                    <span className="tabular-nums text-accent">{formatCurrency(commissionTotal)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Pourboires (détail, y compris annulés) */}
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
                                            {activeTips.length > 1 && (
                                                <div className="mt-1.5 flex justify-between border-t border-tint/[0.06] pt-1.5 font-semibold text-foreground">
                                                    <span>Total</span>
                                                    <span className="tabular-nums text-success">{formatCurrency(tipsTotal)}</span>
                                                </div>
                                            )}
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
                                    <div className="flex flex-wrap gap-2">
                                        {invoice.status === 'paid' && (
                                            <>
                                                <Button type="button" variant="accent" className="flex-1" onClick={print}>
                                                    <Printer />
                                                    Ticket 58 mm
                                                </Button>
                                                <Button type="button" variant="outline" className="flex-1" onClick={printA4}>
                                                    <FileText />
                                                    Facture A4
                                                </Button>
                                            </>
                                        )}
                                        {canRefundInvoice && (
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
