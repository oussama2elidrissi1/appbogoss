import { useState } from 'react';
import { AlertCircle, Banknote, Loader2, PauseCircle, PlayCircle, Plus, ReceiptText, XCircle } from 'lucide-react';
import { ClientPicker, type ClientSelection } from '@/components/workday/ClientPicker';
import { Pos2ClientContext } from '@/components/pos2/Pos2ClientContext';
import { Pos2LineRow } from '@/components/pos2/Pos2LineRow';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import type {
    Pos2ClientContext as ContextData,
    Pos2Invoice,
    Pos2SubscriptionInfo,
    Pos2SubscriptionServiceInfo,
} from '@/types/pos2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Pos2InvoicePanelProps {
    invoice: Pos2Invoice | null;
    clientSelection: ClientSelection;
    clientContext: ContextData | undefined;
    employees: Employee[];
    canDiscount: boolean;
    canCheckout: boolean;
    canCancel: boolean;
    busy: boolean;
    error: string | null;
    onClientChange: (selection: ClientSelection) => void;
    onUpdateLine: (lineId: number, payload: Record<string, unknown>) => void;
    onRemoveLine: (lineId: number) => void;
    onHoldToggle: () => void;
    onCancel: (reason: string) => void;
    onOpenCheckout: () => void;
    onNewInvoice: () => void;
    onUseSubscriptionService: (subscription: Pos2SubscriptionInfo, service: Pos2SubscriptionServiceInfo) => void;
    onUseReward: (rewardId: number, serviceId: number | null) => void;
}

/**
 * The "FACTURE EN COURS" panel (§10): client, lines, totals, and the three
 * big actions — mettre en attente, annuler, ENCAISSER. Always visible while
 * services are being added on desktop; becomes the bottom sheet on mobile.
 */
export function Pos2InvoicePanel({
    invoice,
    clientSelection,
    clientContext,
    employees,
    canDiscount,
    canCheckout,
    canCancel,
    busy,
    error,
    onClientChange,
    onUpdateLine,
    onRemoveLine,
    onHoldToggle,
    onCancel,
    onOpenCheckout,
    onNewInvoice,
    onUseSubscriptionService,
    onUseReward,
}: Pos2InvoicePanelProps) {
    const { t } = useI18n();
    const [cancelling, setCancelling] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    const items = invoice?.items ?? [];
    const lineDiscounts = items.reduce(
        (sum, item) => sum + Math.min(item.discount_amount ?? 0, item.line_total),
        0,
    );
    const editable = invoice !== null && ['draft', 'in_progress', 'services_done'].includes(invoice.status);

    // §1 — UNE LIGNE = UN EMPLOYÉ RESPONSABLE : l'encaissement est bloqué
    // tant qu'une prestation humaine n'a pas son employé (le backend
    // re-vérifie de toute façon).
    const missingEmployeeLines = items.filter(
        (item) => (item.requires_employee ?? item.service_id !== null) && item.employee_id === null,
    );

    // §5/§24 — répartition par employé, purement informative : services,
    // montant et commission (réelle une fois payée, sinon estimation backend).
    const teamRecap = (() => {
        const byEmployee = new Map<
            number,
            { name: string; color: string | null; count: number; amount: number; commission: number }
        >();
        for (const item of items) {
            if (item.employee_id === null) continue;
            const entry = byEmployee.get(item.employee_id) ?? {
                name: item.employee_name ?? `Employé #${item.employee_id}`,
                color: item.employee_avatar_color,
                count: 0,
                amount: 0,
                commission: 0,
            };
            entry.count += 1;
            entry.amount += item.is_free ? 0 : item.effective_line_total;
            entry.commission += item.commission_amount ?? item.estimated_commission ?? 0;
            byEmployee.set(item.employee_id, entry);
        }
        return [...byEmployee.values()];
    })();
    const teamCommissionTotal = teamRecap.reduce((sum, entry) => sum + entry.commission, 0);

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-tint/[0.06] px-4 py-3">
                <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <ReceiptText className="h-4 w-4 text-accent" />
                        {invoice ? invoice.reference : t('Facture en cours')}
                    </p>
                    {invoice && (
                        <p className="text-[11px] text-muted-foreground">
                            {t('Ouverte à {time}', { time: invoice.opened_time ?? '—' })}
                            {invoice.held && ` · ${t('EN ATTENTE')}`}
                        </p>
                    )}
                </div>
                {invoice && editable && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground"
                        disabled={busy}
                        onClick={onHoldToggle}
                    >
                        {invoice.held ? <PlayCircle /> : <PauseCircle />}
                        {invoice.held ? t('Reprendre') : t('En attente')}
                    </Button>
                )}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {/* Client (§18-§19) */}
                <ClientPicker value={clientSelection} onChange={onClientChange} />

                {clientContext && (
                    <Pos2ClientContext
                        context={clientContext}
                        canCollect={canCheckout}
                        busy={busy}
                        onUseSubscriptionService={onUseSubscriptionService}
                        onUseReward={onUseReward}
                    />
                )}

                {/* Lignes (§5-§6) */}
                {items.length === 0 ? (
                    <div className="rounded-md border border-dashed border-tint/[0.15] px-4 py-8 text-center">
                        <p className="text-sm font-medium text-foreground">{t('Aucune ligne')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t("Touchez un service à gauche pour l'ajouter à la facture.")}
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {items.map((line) => (
                            <Pos2LineRow
                                key={line.id}
                                line={line}
                                employees={employees}
                                editable={editable}
                                canDiscount={canDiscount}
                                busy={busy}
                                onUpdate={onUpdateLine}
                                onRemove={onRemoveLine}
                            />
                        ))}
                    </ul>
                )}

                {/* Répartition employés (§5/§24) — informatif uniquement. */}
                {teamRecap.length > 0 && (
                    <div className="rounded-md border border-tint/[0.07] bg-tint/[0.02] p-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('Répartition employés')}
                        </p>
                        <ul className="space-y-1.5">
                            {teamRecap.map((entry) => (
                                <li key={entry.name} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="inline-flex min-w-0 items-center gap-1.5">
                                        <span
                                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                                            style={{ backgroundColor: entry.color ?? '#C8A24C' }}
                                        />
                                        <span className="truncate font-medium text-foreground">{entry.name}</span>
                                        <span className="text-muted-foreground">
                                            · {entry.count} {t(entry.count > 1 ? 'services' : 'service')}
                                        </span>
                                    </span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">
                                        {formatCurrency(entry.amount)}
                                        <span className="ml-2 font-medium text-accent">
                                            {t('comm. {x}', { x: formatCurrency(entry.commission) })}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {teamRecap.length > 1 && (
                            <p className="mt-2 border-t border-tint/[0.06] pt-1.5 text-right text-xs font-semibold tabular-nums text-accent">
                                {t('Total commissions {x}', { x: formatCurrency(teamCommissionTotal) })}
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
            </div>

            {/* Totaux + actions */}
            <div className="space-y-3 border-t border-tint/[0.06] px-4 py-4">
                {invoice && (
                    <div className="space-y-1 text-sm">
                        {(lineDiscounts > 0 || (invoice.discount_amount ?? 0) > 0) && (
                            <>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>{t('Sous-total')}</span>
                                    <span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span>
                                </div>
                                {lineDiscounts > 0 && (
                                    <div className="flex justify-between text-accent">
                                        <span>{t('Remises lignes')}</span>
                                        <span className="tabular-nums">−{formatCurrency(lineDiscounts)}</span>
                                    </div>
                                )}
                                {(invoice.discount_amount ?? 0) > 0 && (
                                    <div className="flex justify-between text-accent">
                                        <span>{t('Remise facture')}</span>
                                        <span className="tabular-nums">−{formatCurrency(invoice.discount_amount ?? 0)}</span>
                                    </div>
                                )}
                            </>
                        )}
                        <div className="flex items-baseline justify-between">
                            <span className="text-base font-semibold text-foreground">{t('Total').toUpperCase()}</span>
                            <span className="font-display text-2xl font-bold tabular-nums text-accent">
                                {formatCurrency(invoice.total)}
                            </span>
                        </div>
                    </div>
                )}

                {cancelling ? (
                    <div className="space-y-2 rounded-md border border-destructive/25 bg-destructive/[0.06] p-3">
                        <Input
                            value={cancelReason}
                            onChange={(event) => setCancelReason(event.target.value)}
                            placeholder={t("Motif d'annulation (optionnel)")}
                            className="h-9"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(false)}>
                                {t('Retour')}
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                    onCancel(cancelReason.trim());
                                    setCancelling(false);
                                    setCancelReason('');
                                }}
                            >
                                <XCircle />
                                {t("Confirmer l'annulation")}
                            </Button>
                        </div>
                    </div>
                ) : invoice ? (
                    <div className="space-y-2">
                        {editable && missingEmployeeLines.length > 0 && (
                            <p className="flex items-start gap-1.5 text-xs text-destructive">
                                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                                <span>
                                    {t("Employé manquant — sélectionnez l'employé responsable de")}{' '}
                                    {missingEmployeeLines.map((item) => `« ${item.label} »`).join(', ')}.
                                </span>
                            </p>
                        )}
                        <div className="flex items-center gap-2">
                            {editable && canCancel && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12 shrink-0 text-destructive hover:text-destructive"
                                    disabled={busy}
                                    onClick={() => setCancelling(true)}
                                >
                                    <XCircle />
                                </Button>
                            )}
                            <Button
                                type="button"
                                variant="accent"
                                className={cn('h-12 flex-1 text-base font-semibold shadow-glow')}
                                disabled={
                                    busy ||
                                    !canCheckout ||
                                    !editable ||
                                    items.length === 0 ||
                                    missingEmployeeLines.length > 0
                                }
                                onClick={onOpenCheckout}
                            >
                                {busy ? <Loader2 className="animate-spin" /> : <Banknote />}
                                {t('ENCAISSER')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button type="button" variant="accent" className="h-12 w-full text-base font-semibold" onClick={onNewInvoice}>
                        <Plus />
                        {t('Nouvelle facture')}
                    </Button>
                )}
            </div>
        </div>
    );
}
