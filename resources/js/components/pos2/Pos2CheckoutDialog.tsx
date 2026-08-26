import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote, CheckCircle2, CreditCard, HandCoins, Landmark, Loader2, Plus, Printer, Trash2, Wallet } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import type {
    Pos2BreakdownRow,
    Pos2CheckoutPayload,
    Pos2Invoice,
    Pos2PaymentMethod,
    Pos2TenderMethod,
    Pos2TipPayload,
} from '@/types/pos2';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const METHODS: Array<{ value: Pos2PaymentMethod; label: string; icon: typeof Banknote }> = [
    { value: 'especes', label: 'Espèces', icon: Banknote },
    { value: 'carte', label: 'Carte', icon: CreditCard },
    { value: 'virement', label: 'Virement', icon: Landmark },
    { value: 'mixte', label: 'Mixte', icon: Wallet },
    { value: 'autre', label: 'Autre', icon: HandCoins },
];

const TENDER_METHODS: Array<{ value: Pos2TenderMethod; label: string }> = [
    { value: 'especes', label: 'Espèces' },
    { value: 'carte', label: 'Carte' },
    { value: 'virement', label: 'Virement' },
    { value: 'autre', label: 'Autre' },
];

interface TipDraft {
    /** Ligne associée — null = pourboire général (§8). */
    itemId: number | null;
    employee_id: number | null;
    amount: string;
}

const GENERAL_TIP = '__general__';

interface Pos2CheckoutDialogProps {
    open: boolean;
    invoice: Pos2Invoice | null;
    employees: Employee[];
    canDiscount: boolean;
    onClose: () => void;
    onSubmit: (payload: Pos2CheckoutPayload) => Promise<Pos2Invoice>;
    onPrint: (invoice: Pos2Invoice) => void;
    onFinished: () => void;
}

/**
 * ENCAISSER (§25-§30): summary, remise facture, moyens de paiement (mixte
 * avec répartition contrôlée), monnaie automatique, pourboires par employé,
 * then the success screen with IMPRIMER TICKET / NOUVELLE VENTE.
 * Every amount is recomputed server-side — expected_total is sent so a stale
 * cart is refused instead of silently charged.
 */
export function Pos2CheckoutDialog({
    open,
    invoice,
    employees,
    canDiscount,
    onClose,
    onSubmit,
    onPrint,
    onFinished,
}: Pos2CheckoutDialogProps) {
    const [method, setMethod] = useState<Pos2PaymentMethod>('especes');
    const [received, setReceived] = useState('');
    const [breakdown, setBreakdown] = useState<Array<{ method: Pos2TenderMethod; amount: string }>>([
        { method: 'especes', amount: '' },
        { method: 'carte', amount: '' },
    ]);
    const [discount, setDiscount] = useState('');
    const [discountReason, setDiscountReason] = useState('');
    const [tips, setTips] = useState<TipDraft[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [paidInvoice, setPaidInvoice] = useState<Pos2Invoice | null>(null);

    useEffect(() => {
        if (open) {
            setMethod('especes');
            setReceived('');
            setBreakdown([
                { method: 'especes', amount: '' },
                { method: 'carte', amount: '' },
            ]);
            setDiscount(invoice?.discount_amount ? String(invoice.discount_amount) : '');
            setDiscountReason(invoice?.discount_reason ?? '');
            setTips([]);
            setError(null);
            setPaidInvoice(null);
            setSubmitting(false);
        }
    }, [open, invoice?.id, invoice?.discount_amount, invoice?.discount_reason]);

    const items = invoice?.items ?? [];
    const subtotal = invoice?.subtotal ?? 0;
    const lineDiscounts = items.reduce(
        (sum, item) => sum + Math.min(item.discount_amount ?? 0, item.line_total),
        0,
    );
    const parsedDiscount = useMemo(() => {
        const value = Number(discount.replace(',', '.'));
        return Number.isNaN(value) || value < 0 ? 0 : value;
    }, [discount]);
    const total = Math.max(0, Math.round((subtotal - lineDiscounts - parsedDiscount) * 100) / 100);

    const parsedReceived = Number(received.replace(',', '.'));
    const change = !Number.isNaN(parsedReceived) && parsedReceived >= total ? parsedReceived - total : null;

    const breakdownRows: Pos2BreakdownRow[] = breakdown
        .map((row) => ({ method: row.method, amount: Number(row.amount.replace(',', '.')) }))
        .filter((row) => !Number.isNaN(row.amount) && row.amount > 0);
    const breakdownSum = Math.round(breakdownRows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
    const breakdownRest = Math.round((total - breakdownSum) * 100) / 100;

    // Une ligne associée impose son employé comme bénéficiaire (§8) — le
    // backend le re-vérifie de toute façon.
    const lineOptions = items.filter((item) => item.employee_id !== null);
    const tipRows: Pos2TipPayload[] = tips
        .map((tip) => {
            const line = tip.itemId !== null ? lineOptions.find((item) => item.id === tip.itemId) : undefined;
            const employeeId = line ? line.employee_id : tip.employee_id;
            return {
                employee_id: employeeId as number,
                amount: Number(tip.amount.replace(',', '.')),
                ...(line ? { prestation_item_id: line.id } : {}),
            };
        })
        .filter((tip) => tip.employee_id != null && !Number.isNaN(tip.amount) && tip.amount > 0);
    const tipsTotal = tipRows.reduce((sum, tip) => sum + tip.amount, 0);

    const canSubmit =
        !submitting &&
        items.length > 0 &&
        (method !== 'mixte' || (breakdownRows.length >= 2 && Math.abs(breakdownRest) <= 0.01)) &&
        (method !== 'especes' || received === '' || (change !== null && change >= 0));

    async function submit() {
        if (!invoice || !canSubmit) return;
        setSubmitting(true);
        setError(null);
        try {
            const payload: Pos2CheckoutPayload = {
                payment_method: method,
                expected_total: total,
                ...(method === 'mixte' ? { payment_breakdown: breakdownRows } : {}),
                ...(method === 'especes' && received !== '' && !Number.isNaN(parsedReceived)
                    ? { amount_received: parsedReceived }
                    : {}),
                ...(canDiscount && discount !== ''
                    ? { discount_amount: parsedDiscount, discount_reason: discountReason.trim() || null }
                    : {}),
                ...(tipRows.length > 0 ? { tips: tipRows } : {}),
            };
            const paid = await onSubmit(payload);
            setPaidInvoice(paid);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    }

    function updateBreakdownAmount(index: number, value: string) {
        setBreakdown((rows) => rows.map((row, i) => (i === index ? { ...row, amount: value } : row)));
    }

    function autoFillRest(index: number) {
        if (breakdownRest <= 0) return;
        const current = Number(breakdown[index]?.amount.replace(',', '.')) || 0;
        updateBreakdownAmount(index, String(Math.round((current + breakdownRest) * 100) / 100));
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !submitting && onClose()}>
            <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
                {paidInvoice ? (
                    /* ------------------- Écran de succès (§30) ------------------- */
                    <div className="space-y-5 py-2 text-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/30 bg-success/[0.12]">
                            <CheckCircle2 className="h-8 w-8 text-success" />
                        </div>
                        <div>
                            <h2 className="font-display text-2xl font-bold text-foreground">Paiement validé</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{paidInvoice.reference}</p>
                        </div>
                        <p className="font-display text-4xl font-bold tabular-nums text-accent">
                            {formatCurrency(paidInvoice.total)}
                        </p>
                        {(paidInvoice.change_given ?? 0) > 0 && (
                            <p className="text-sm text-muted-foreground">
                                À rendre :{' '}
                                <span className="font-semibold text-foreground">
                                    {formatCurrency(paidInvoice.change_given ?? 0)}
                                </span>
                            </p>
                        )}
                        {(paidInvoice.tips_total ?? 0) > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Pourboires enregistrés : {formatCurrency(paidInvoice.tips_total ?? 0)}
                            </p>
                        )}
                        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-12 flex-1"
                                onClick={() => onPrint(paidInvoice)}
                            >
                                <Printer />
                                Imprimer le ticket
                            </Button>
                            <Button type="button" variant="accent" className="h-12 flex-1" onClick={onFinished}>
                                <Plus />
                                Nouvelle vente
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl">Encaisser {invoice?.reference}</DialogTitle>
                        </DialogHeader>

                        {/* Récapitulatif */}
                        <div className="space-y-1 rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3.5 py-3 text-sm">
                            <div className="flex justify-between text-muted-foreground">
                                <span>Sous-total ({items.length} ligne{items.length > 1 ? 's' : ''})</span>
                                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                            </div>
                            {lineDiscounts > 0 && (
                                <div className="flex justify-between text-accent">
                                    <span>Remises lignes</span>
                                    <span className="tabular-nums">−{formatCurrency(lineDiscounts)}</span>
                                </div>
                            )}
                            {canDiscount && (
                                <div className="flex items-center justify-between gap-3 py-1">
                                    <span className="text-muted-foreground">Remise facture</span>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            inputMode="decimal"
                                            value={discount}
                                            onChange={(event) => setDiscount(event.target.value)}
                                            placeholder="0"
                                            className="h-8 w-20 text-right tabular-nums"
                                        />
                                        <span className="text-xs text-muted-foreground">MAD</span>
                                    </div>
                                </div>
                            )}
                            {canDiscount && parsedDiscount > 0 && (
                                <Input
                                    value={discountReason}
                                    onChange={(event) => setDiscountReason(event.target.value)}
                                    placeholder="Raison de la remise"
                                    className="h-8 text-xs"
                                />
                            )}
                            <div className="flex items-baseline justify-between border-t border-tint/[0.06] pt-2">
                                <span className="font-semibold text-foreground">TOTAL À PAYER</span>
                                <span className="font-display text-2xl font-bold tabular-nums text-accent">
                                    {formatCurrency(total)}
                                </span>
                            </div>
                        </div>

                        {/* Moyen de paiement (§26) */}
                        <div className="space-y-2">
                            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Moyen de paiement
                            </Label>
                            <div className="grid grid-cols-5 gap-1.5">
                                {METHODS.map((option) => {
                                    const Icon = option.icon;
                                    return (
                                        <Chip
                                            key={option.value}
                                            size="lg"
                                            className="h-[64px] w-full text-xs"
                                            selected={method === option.value}
                                            onClick={() => setMethod(option.value)}
                                        >
                                            <Icon />
                                            {option.label}
                                        </Chip>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Espèces : monnaie (§28) */}
                        {method === 'especes' && (
                            <div className="space-y-2 rounded-md border border-tint/[0.07] bg-tint/[0.02] p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <Label className="text-xs text-muted-foreground">Montant reçu</Label>
                                    <div className="flex items-center gap-1.5">
                                        {[total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100]
                                            .filter((value, index, all) => value > 0 && all.indexOf(value) === index)
                                            .map((value) => (
                                                <Chip key={value} size="sm" onClick={() => setReceived(String(value))}>
                                                    {formatCurrency(value, { maximumFractionDigits: 0 })}
                                                </Chip>
                                            ))}
                                    </div>
                                </div>
                                <Input
                                    inputMode="decimal"
                                    value={received}
                                    onChange={(event) => setReceived(event.target.value)}
                                    placeholder="Montant remis par le client"
                                    className="h-11 text-right text-base tabular-nums"
                                    autoFocus
                                />
                                {received !== '' && (
                                    <p
                                        className={cn(
                                            'text-right text-sm font-semibold tabular-nums',
                                            change !== null ? 'text-success' : 'text-destructive',
                                        )}
                                    >
                                        {change !== null
                                            ? `À rendre : ${formatCurrency(change)}`
                                            : 'Montant insuffisant'}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Paiement mixte (§26) */}
                        {method === 'mixte' && (
                            <div className="space-y-2 rounded-md border border-tint/[0.07] bg-tint/[0.02] p-3">
                                {breakdown.map((row, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <div className="flex flex-1 flex-wrap gap-1">
                                            {TENDER_METHODS.map((tender) => (
                                                <Chip
                                                    key={tender.value}
                                                    size="sm"
                                                    selected={row.method === tender.value}
                                                    onClick={() =>
                                                        setBreakdown((rows) =>
                                                            rows.map((r, i) =>
                                                                i === index ? { ...r, method: tender.value } : r,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    {tender.label}
                                                </Chip>
                                            ))}
                                        </div>
                                        <Input
                                            inputMode="decimal"
                                            value={row.amount}
                                            onChange={(event) => updateBreakdownAmount(index, event.target.value)}
                                            onFocus={() => row.amount === '' && autoFillRest(index)}
                                            placeholder="0"
                                            className="h-10 w-24 text-right tabular-nums"
                                        />
                                    </div>
                                ))}
                                <div className="flex items-center justify-between pt-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={breakdown.length >= 4}
                                        onClick={() =>
                                            setBreakdown((rows) => [...rows, { method: 'autre', amount: '' }])
                                        }
                                    >
                                        <Plus />
                                        Ajouter un moyen
                                    </Button>
                                    <p
                                        className={cn(
                                            'text-sm font-semibold tabular-nums',
                                            Math.abs(breakdownRest) <= 0.01 ? 'text-success' : 'text-destructive',
                                        )}
                                    >
                                        Reste : {formatCurrency(breakdownRest)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Pourboires (§13) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                    Pourboires
                                </Label>
                                {tipsTotal > 0 && (
                                    <span className="text-xs font-semibold tabular-nums text-success">
                                        {formatCurrency(tipsTotal)}
                                    </span>
                                )}
                            </div>
                            {tips.map((tip, index) => {
                                const linkedLine =
                                    tip.itemId !== null
                                        ? lineOptions.find((item) => item.id === tip.itemId)
                                        : undefined;
                                return (
                                    <div key={index} className="space-y-1.5 rounded-md border border-tint/[0.07] bg-tint/[0.02] p-2.5">
                                        <div className="flex items-center gap-2">
                                            <Select
                                                value={tip.itemId !== null ? String(tip.itemId) : GENERAL_TIP}
                                                onValueChange={(value) =>
                                                    setTips((rows) =>
                                                        rows.map((r, i) =>
                                                            i === index
                                                                ? {
                                                                      ...r,
                                                                      itemId: value === GENERAL_TIP ? null : Number(value),
                                                                  }
                                                                : r,
                                                        ),
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="h-9 flex-1 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={GENERAL_TIP}>Pourboire général</SelectItem>
                                                    {lineOptions.map((item) => (
                                                        <SelectItem key={item.id} value={String(item.id)}>
                                                            {item.label} — {item.employee_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Input
                                                inputMode="decimal"
                                                value={tip.amount}
                                                onChange={(event) =>
                                                    setTips((rows) =>
                                                        rows.map((r, i) =>
                                                            i === index ? { ...r, amount: event.target.value } : r,
                                                        ),
                                                    )
                                                }
                                                placeholder="0"
                                                className="h-9 w-20 text-right tabular-nums"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 shrink-0 text-muted-foreground"
                                                onClick={() => setTips((rows) => rows.filter((_, i) => i !== index))}
                                            >
                                                <Trash2 />
                                            </Button>
                                        </div>
                                        {linkedLine ? (
                                            <p className="text-[11px] text-muted-foreground">
                                                Bénéficiaire : <span className="font-medium text-foreground">{linkedLine.employee_name}</span>{' '}
                                                (employé de la ligne)
                                            </p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {employees.map((employee) => (
                                                    <Chip
                                                        key={employee.id}
                                                        size="sm"
                                                        selected={tip.employee_id === employee.id}
                                                        onClick={() =>
                                                            setTips((rows) =>
                                                                rows.map((r, i) =>
                                                                    i === index
                                                                        ? { ...r, employee_id: employee.id }
                                                                        : r,
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        <span
                                                            className="inline-block h-2 w-2 rounded-full"
                                                            style={{ backgroundColor: employee.avatar_color }}
                                                        />
                                                        {employee.name}
                                                    </Chip>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9"
                                disabled={tips.length >= 10}
                                onClick={() =>
                                    setTips((rows) => [
                                        ...rows,
                                        {
                                            itemId: lineOptions.length === 1 ? lineOptions[0].id : null,
                                            employee_id:
                                                lineOptions.length === 1
                                                    ? lineOptions[0].employee_id
                                                    : (lineOptions[0]?.employee_id ?? null),
                                            amount: '',
                                        },
                                    ])
                                }
                            >
                                <HandCoins />
                                Ajouter un pourboire
                            </Button>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3 py-2.5">
                                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                                <p className="text-xs text-destructive">{error}</p>
                            </div>
                        )}

                        <Button
                            type="button"
                            variant="accent"
                            className="h-14 w-full text-lg font-bold shadow-glow"
                            disabled={!canSubmit}
                            onClick={submit}
                        >
                            {submitting ? <Loader2 className="animate-spin" /> : <Banknote />}
                            VALIDER — {formatCurrency(total)}
                        </Button>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
