import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote, CreditCard, HandCoins, Landmark, Loader2, Plus, Wallet, X } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency } from '@/lib/utils';
import type {
    Pos2BreakdownRow,
    Pos2CheckoutPayload,
    Pos2Invoice,
    Pos2InvoiceLine,
    Pos2PaymentMethod,
    Pos2TenderMethod,
    Pos2TipPayload,
} from '@/types/pos2';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

const TIP_PRESETS = [10, 20, 50];

/** Per-invoice-employee tip draft: one global amount, or detailed per line. */
interface TipDraft {
    amount: string;
    detailed: boolean;
    byItem: Record<number, string>;
}

interface InvoiceEmployee {
    id: number;
    name: string;
    color: string | null;
    lines: Pos2InvoiceLine[];
    servicesTotal: number;
}

interface Pos2CheckoutDialogProps {
    open: boolean;
    invoice: Pos2Invoice | null;
    canDiscount: boolean;
    onClose: () => void;
    onSubmit: (payload: Pos2CheckoutPayload) => Promise<Pos2Invoice>;
    /** Paiement réussi : le parent ferme ce modal et ouvre Pos2SuccessDialog. */
    onPaid: (invoice: Pos2Invoice) => void;
}

/**
 * ENCAISSER (V2.1) — récap, remise, moyens de paiement (mixte contrôlé),
 * monnaie automatique, puis POURBOIRES par employé DE LA FACTURE uniquement
 * (§6-§10) : une card par employé avec raccourcis +10/+20/+50 et détail par
 * service optionnel (§8). L'écran de succès vit dans Pos2SuccessDialog, au
 * niveau de la page, pour survivre à tout rafraîchissement de données.
 * Tous les montants restent recalculés côté serveur.
 */
export function Pos2CheckoutDialog({
    open,
    invoice,
    canDiscount,
    onClose,
    onSubmit,
    onPaid,
}: Pos2CheckoutDialogProps) {
    const { t } = useI18n();
    const [method, setMethod] = useState<Pos2PaymentMethod>('especes');
    const [received, setReceived] = useState('');
    const [breakdown, setBreakdown] = useState<Array<{ method: Pos2TenderMethod; amount: string }>>([
        { method: 'especes', amount: '' },
        { method: 'carte', amount: '' },
    ]);
    const [discount, setDiscount] = useState('');
    const [discountReason, setDiscountReason] = useState('');
    const [tips, setTips] = useState<Record<number, TipDraft>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset ONLY when the dialog opens. Depending on the invoice here was a
    // bug: right after a successful payment the invoice leaves the
    // open-invoices list (prop becomes null), which re-ran this effect and
    // wiped the success screen the instant it appeared.
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
            setTips({});
            setError(null);
            setSubmitting(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const items = useMemo(() => invoice?.items ?? [], [invoice]);
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

    // §6/§10 — les bénéficiaires possibles sont dérivés des LIGNES de la
    // facture, jamais de la liste complète du salon.
    const invoiceEmployees: InvoiceEmployee[] = useMemo(() => {
        const map = new Map<number, InvoiceEmployee>();
        for (const item of items) {
            if (item.employee_id === null) continue;
            const entry = map.get(item.employee_id) ?? {
                id: item.employee_id,
                name: item.employee_name ?? `Employé #${item.employee_id}`,
                color: item.employee_avatar_color,
                lines: [],
                servicesTotal: 0,
            };
            entry.lines.push(item);
            entry.servicesTotal += item.is_free ? 0 : item.effective_line_total;
            map.set(item.employee_id, entry);
        }
        return [...map.values()];
    }, [items]);

    function parseAmount(raw: string): number {
        const value = Number(raw.replace(',', '.'));
        return Number.isNaN(value) || value <= 0 ? 0 : Math.round(value * 100) / 100;
    }

    const tipRows: Pos2TipPayload[] = invoiceEmployees.flatMap((employee) => {
        const draft = tips[employee.id];
        if (!draft) return [];
        if (draft.detailed) {
            return employee.lines
                .map((line) => ({ line, amount: parseAmount(draft.byItem[line.id] ?? '') }))
                .filter(({ amount }) => amount > 0)
                .map(({ line, amount }) => ({
                    employee_id: employee.id,
                    amount,
                    prestation_item_id: line.id,
                }));
        }
        const amount = parseAmount(draft.amount);
        return amount > 0 ? [{ employee_id: employee.id, amount }] : [];
    });
    const tipsTotal = tipRows.reduce((sum, tip) => sum + tip.amount, 0);

    const canSubmit =
        !submitting &&
        items.length > 0 &&
        (method !== 'mixte' || (breakdownRows.length >= 2 && Math.abs(breakdownRest) <= 0.01)) &&
        (method !== 'especes' || received === '' || (change !== null && change >= 0));

    function updateTip(employeeId: number, updater: (draft: TipDraft) => TipDraft) {
        setTips((current) => ({
            ...current,
            [employeeId]: updater(current[employeeId] ?? { amount: '', detailed: false, byItem: {} }),
        }));
    }

    function addPreset(employeeId: number, preset: number) {
        updateTip(employeeId, (draft) => ({
            ...draft,
            detailed: false,
            amount: String(Math.round((parseAmount(draft.amount) + preset) * 100) / 100),
        }));
    }

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
            onPaid(paid);
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
                    <>
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl">
                                {t('Encaisser {ref}', { ref: invoice?.reference ?? '' })}
                            </DialogTitle>
                        </DialogHeader>

                        {/* Récapitulatif */}
                        <div className="space-y-1 rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3.5 py-3 text-sm">
                            <div className="flex justify-between text-muted-foreground">
                                <span>
                                    {t('Sous-total')} ({items.length} {t(items.length > 1 ? 'lignes' : 'ligne')})
                                </span>
                                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                            </div>
                            {lineDiscounts > 0 && (
                                <div className="flex justify-between text-accent">
                                    <span>{t('Remises lignes')}</span>
                                    <span className="tabular-nums">−{formatCurrency(lineDiscounts)}</span>
                                </div>
                            )}
                            {canDiscount && (
                                <div className="flex items-center justify-between gap-3 py-1">
                                    <span className="text-muted-foreground">{t('Remise facture')}</span>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            inputMode="decimal"
                                            value={discount}
                                            onChange={(event) => setDiscount(event.target.value)}
                                            placeholder="0"
                                            className="h-8 w-20 text-right tabular-nums"
                                        />
                                        <span className="text-xs text-muted-foreground">{t('MAD')}</span>
                                    </div>
                                </div>
                            )}
                            {canDiscount && parsedDiscount > 0 && (
                                <Input
                                    value={discountReason}
                                    onChange={(event) => setDiscountReason(event.target.value)}
                                    placeholder={t('Raison de la remise')}
                                    className="h-8 text-xs"
                                />
                            )}
                            <div className="flex items-baseline justify-between border-t border-tint/[0.06] pt-2">
                                <span className="font-semibold text-foreground">{t('TOTAL À ENCAISSER')}</span>
                                <span className="font-display text-2xl font-bold tabular-nums text-accent">
                                    {formatCurrency(total)}
                                </span>
                            </div>
                        </div>

                        {/* Moyen de paiement (§26 V2) */}
                        <div className="space-y-2">
                            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                {t('Moyen de paiement')}
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
                                            {t(option.label)}
                                        </Chip>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Espèces : monnaie */}
                        {method === 'especes' && (
                            <div className="space-y-2 rounded-md border border-tint/[0.07] bg-tint/[0.02] p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <Label className="text-xs text-muted-foreground">{t('Montant reçu')}</Label>
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
                                    placeholder={t('Montant remis par le client')}
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
                                            ? t('À rendre : {x}', { x: formatCurrency(change) })
                                            : t('Montant insuffisant')}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Paiement mixte */}
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
                                                    {t(tender.label)}
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
                                        {t('Ajouter un moyen')}
                                    </Button>
                                    <p
                                        className={cn(
                                            'text-sm font-semibold tabular-nums',
                                            Math.abs(breakdownRest) <= 0.01 ? 'text-success' : 'text-destructive',
                                        )}
                                    >
                                        {t('Reste : {x}', { x: formatCurrency(breakdownRest) })}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ------------------- Pourboires (§6-§10, §30) ------------------- */}
                        {invoiceEmployees.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        {t('Pourboires — employés de cette facture')}
                                    </Label>
                                    {tipsTotal > 0 && (
                                        <span className="text-xs font-semibold tabular-nums text-success">
                                            {formatCurrency(tipsTotal)}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {invoiceEmployees.map((employee) => {
                                        const draft = tips[employee.id] ?? { amount: '', detailed: false, byItem: {} };
                                        const employeeTotal = draft.detailed
                                            ? employee.lines.reduce(
                                                  (sum, line) => sum + parseAmount(draft.byItem[line.id] ?? ''),
                                                  0,
                                              )
                                            : parseAmount(draft.amount);
                                        return (
                                            <div
                                                key={employee.id}
                                                className={cn(
                                                    'rounded-md border p-3 transition-colors',
                                                    employeeTotal > 0
                                                        ? 'border-success/30 bg-success/[0.04]'
                                                        : 'border-tint/[0.07] bg-tint/[0.02]',
                                                )}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="inline-flex min-w-0 items-center gap-2">
                                                        <span
                                                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                                            style={{ backgroundColor: employee.color ?? '#C8A24C' }}
                                                        />
                                                        <span className="truncate text-sm font-semibold text-foreground">
                                                            {employee.name}
                                                        </span>
                                                    </span>
                                                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                                        {employee.lines.map((line) => line.label).join(' + ')} ·{' '}
                                                        {formatCurrency(employee.servicesTotal)}
                                                    </span>
                                                </div>

                                                {!draft.detailed ? (
                                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                        <Input
                                                            inputMode="decimal"
                                                            value={draft.amount}
                                                            onChange={(event) =>
                                                                updateTip(employee.id, (d) => ({
                                                                    ...d,
                                                                    amount: event.target.value,
                                                                }))
                                                            }
                                                            placeholder="0"
                                                            className="h-9 w-20 text-right tabular-nums"
                                                        />
                                                        <span className="mr-1 text-xs text-muted-foreground">{t('MAD')}</span>
                                                        {TIP_PRESETS.map((preset) => (
                                                            <Chip
                                                                key={preset}
                                                                size="sm"
                                                                onClick={() => addPreset(employee.id, preset)}
                                                            >
                                                                +{preset}
                                                            </Chip>
                                                        ))}
                                                        {parseAmount(draft.amount) > 0 && (
                                                            <button
                                                                type="button"
                                                                className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                                                                onClick={() =>
                                                                    updateTip(employee.id, (d) => ({ ...d, amount: '' }))
                                                                }
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                                <span className="sr-only">{t('Effacer')}</span>
                                                            </button>
                                                        )}
                                                        {employee.lines.length > 1 && (
                                                            <button
                                                                type="button"
                                                                className="ml-auto text-[11px] font-medium text-accent hover:underline"
                                                                onClick={() =>
                                                                    updateTip(employee.id, (d) => ({
                                                                        ...d,
                                                                        detailed: true,
                                                                    }))
                                                                }
                                                            >
                                                                {t('Détailler par service')}
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="mt-2 space-y-1.5">
                                                        {employee.lines.map((line) => (
                                                            <div key={line.id} className="flex items-center justify-between gap-2">
                                                                <span className="min-w-0 truncate text-xs text-muted-foreground">
                                                                    {line.label}
                                                                </span>
                                                                <Input
                                                                    inputMode="decimal"
                                                                    value={draft.byItem[line.id] ?? ''}
                                                                    onChange={(event) =>
                                                                        updateTip(employee.id, (d) => ({
                                                                            ...d,
                                                                            byItem: {
                                                                                ...d.byItem,
                                                                                [line.id]: event.target.value,
                                                                            },
                                                                        }))
                                                                    }
                                                                    placeholder="0"
                                                                    className="h-8 w-20 shrink-0 text-right tabular-nums"
                                                                />
                                                            </div>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            className="text-[11px] font-medium text-accent hover:underline"
                                                            onClick={() =>
                                                                updateTip(employee.id, (d) => ({
                                                                    ...d,
                                                                    detailed: false,
                                                                    byItem: {},
                                                                }))
                                                            }
                                                        >
                                                            {t('Revenir au pourboire global')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {tipsTotal > 0 && (
                                    <p className="text-[11px] text-muted-foreground">
                                        {t(
                                            'Total pourboires {x} — remis directement aux employés, hors total à encaisser.',
                                            { x: formatCurrency(tipsTotal) },
                                        )}
                                    </p>
                                )}
                            </div>
                        )}

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
                            {t('VALIDER — {x}', { x: formatCurrency(total) })}
                        </Button>
                    </>
            </DialogContent>
        </Dialog>
    );
}
