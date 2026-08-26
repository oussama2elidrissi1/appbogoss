import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, ChevronDown, Minus, Plus, Trash2, UserRound } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import type { Pos2InvoiceLine } from '@/types/pos2';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Pos2LineRowProps {
    line: Pos2InvoiceLine;
    employees: Employee[];
    editable: boolean;
    canDiscount: boolean;
    busy: boolean;
    onUpdate: (lineId: number, payload: Record<string, unknown>) => void;
    onRemove: (lineId: number) => void;
}

/**
 * One invoice line. Tapping it expands an inline editor (quantity, price,
 * employee, remise, bénéficiaire) — deliberately not a modal so the cart
 * stays visible while editing (§45).
 */
export function Pos2LineRow({ line, employees, editable, canDiscount, busy, onUpdate, onRemove }: Pos2LineRowProps) {
    const [expanded, setExpanded] = useState(false);
    const [priceDraft, setPriceDraft] = useState<string | null>(null);
    const [discountDraft, setDiscountDraft] = useState<string | null>(null);
    const [beneficiaryDraft, setBeneficiaryDraft] = useState<string | null>(null);

    const discount = Math.min(line.discount_amount ?? 0, line.line_total);
    const displayTotal = line.is_free ? 0 : line.line_total - discount;

    function commitPrice() {
        if (priceDraft === null) return;
        const parsed = Number(priceDraft.replace(',', '.'));
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed !== line.unit_price) {
            onUpdate(line.id, { unit_price: parsed });
        }
        setPriceDraft(null);
    }

    function commitDiscount() {
        if (discountDraft === null) return;
        const parsed = Number(discountDraft.replace(',', '.'));
        if (!Number.isNaN(parsed) && parsed >= 0) {
            onUpdate(line.id, { discount_amount: parsed > 0 ? parsed : null });
        }
        setDiscountDraft(null);
    }

    function commitBeneficiary() {
        if (beneficiaryDraft === null) return;
        const trimmed = beneficiaryDraft.trim();
        if (trimmed !== (line.beneficiary_name ?? '')) {
            onUpdate(line.id, { beneficiary_name: trimmed || null });
        }
        setBeneficiaryDraft(null);
    }

    return (
        <li
            className={cn(
                'rounded-md border transition-colors duration-200',
                expanded ? 'border-accent/40 bg-accent/[0.05]' : 'border-tint/[0.07] bg-tint/[0.02]',
            )}
        >
            <button
                type="button"
                onClick={() => editable && setExpanded((value) => !value)}
                className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
            >
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                        {line.label}
                        {line.quantity > 1 && <span className="text-muted-foreground"> ×{line.quantity}</span>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {line.employee_name ? (
                            <span className="inline-flex items-center gap-1">
                                <span
                                    className="inline-block h-2 w-2 rounded-full"
                                    style={{ backgroundColor: line.employee_avatar_color ?? '#C8A24C' }}
                                />
                                {line.employee_name}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-destructive">
                                <UserRound className="h-3 w-3" />
                                Sans employé
                            </span>
                        )}
                        {line.beneficiary_name && <span>· {line.beneficiary_name}</span>}
                        {line.is_free && (
                            <span className="inline-flex items-center gap-1 text-success">
                                <BadgeCheck className="h-3 w-3" />
                                Abonnement
                            </span>
                        )}
                        {discount > 0 && <span className="text-accent">Remise −{formatCurrency(discount)}</span>}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                            {formatCurrency(displayTotal)}
                        </p>
                        {line.is_free && line.public_price !== null && (
                            <p className="text-[11px] tabular-nums text-muted-foreground line-through">
                                {formatCurrency(line.public_price)}
                            </p>
                        )}
                    </div>
                    {editable && (
                        <ChevronDown
                            className={cn(
                                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                                expanded && 'rotate-180',
                            )}
                        />
                    )}
                </div>
            </button>

            <AnimatePresence initial={false}>
                {expanded && editable && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-3 border-t border-tint/[0.06] px-3 py-3">
                            <div className="flex flex-wrap items-end gap-3">
                                {!line.is_free && (
                                    <>
                                        <div className="space-y-1">
                                            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                Quantité
                                            </Label>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-9 w-9"
                                                    disabled={busy || line.quantity <= 1}
                                                    onClick={() => onUpdate(line.id, { quantity: line.quantity - 1 })}
                                                >
                                                    <Minus />
                                                </Button>
                                                <span className="w-8 text-center text-sm font-semibold tabular-nums">
                                                    {line.quantity}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-9 w-9"
                                                    disabled={busy}
                                                    onClick={() => onUpdate(line.id, { quantity: line.quantity + 1 })}
                                                >
                                                    <Plus />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="w-24 space-y-1">
                                            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                Prix (MAD)
                                            </Label>
                                            <Input
                                                inputMode="decimal"
                                                className="h-9 text-right tabular-nums"
                                                value={priceDraft ?? String(line.unit_price)}
                                                onChange={(event) => setPriceDraft(event.target.value)}
                                                onBlur={commitPrice}
                                                onKeyDown={(event) => event.key === 'Enter' && commitPrice()}
                                                disabled={busy}
                                            />
                                        </div>
                                        {canDiscount && (
                                            <div className="w-24 space-y-1">
                                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                    Remise (MAD)
                                                </Label>
                                                <Input
                                                    inputMode="decimal"
                                                    className="h-9 text-right tabular-nums"
                                                    placeholder="0"
                                                    value={discountDraft ?? (line.discount_amount ? String(line.discount_amount) : '')}
                                                    onChange={(event) => setDiscountDraft(event.target.value)}
                                                    onBlur={commitDiscount}
                                                    onKeyDown={(event) => event.key === 'Enter' && commitDiscount()}
                                                    disabled={busy}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                                <div className="w-36 space-y-1">
                                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Bénéficiaire
                                    </Label>
                                    <Input
                                        className="h-9"
                                        placeholder="ex. Yassine"
                                        value={beneficiaryDraft ?? (line.beneficiary_name ?? '')}
                                        onChange={(event) => setBeneficiaryDraft(event.target.value)}
                                        onBlur={commitBeneficiary}
                                        onKeyDown={(event) => event.key === 'Enter' && commitBeneficiary()}
                                        disabled={busy}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                    Employé de la ligne
                                </Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {employees.map((employee) => (
                                        <Chip
                                            key={employee.id}
                                            size="sm"
                                            selected={line.employee_id === employee.id}
                                            disabled={busy}
                                            onClick={() =>
                                                onUpdate(line.id, {
                                                    employee_id: line.employee_id === employee.id ? null : employee.id,
                                                })
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
                            </div>

                            <div className="flex items-center justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    disabled={busy}
                                    onClick={() => onRemove(line.id)}
                                >
                                    <Trash2 />
                                    Supprimer la ligne
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </li>
    );
}
