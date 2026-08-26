import { CheckCircle2, Eye, FileText, Plus, Printer } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatCurrency } from '@/lib/utils';
import { paymentMethodLabel } from '@/lib/receiptV2';
import type { Pos2Invoice } from '@/types/pos2';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface Pos2SuccessDialogProps {
    invoice: Pos2Invoice | null;
    onPrintTicket: (invoice: Pos2Invoice) => void;
    onPrintA4: (invoice: Pos2Invoice) => void;
    onViewDetail: (invoice: Pos2Invoice) => void;
    onNewSale: () => void;
    onClose: () => void;
}

/**
 * PAIEMENT VALIDÉ (§13) — deliberately its OWN dialog, mounted at page level
 * and driven only by the paid invoice held in page state: no query refresh,
 * invoice-list update or checkout-dialog reset can ever dismiss it. It stays
 * until the cashier chooses an action.
 */
export function Pos2SuccessDialog({
    invoice,
    onPrintTicket,
    onPrintA4,
    onViewDetail,
    onNewSale,
    onClose,
}: Pos2SuccessDialogProps) {
    const { t } = useI18n();

    return (
        <Dialog open={invoice !== null} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-lg">
                {invoice && (
                    <div className="space-y-5 py-2 text-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/30 bg-success/[0.12]">
                            <CheckCircle2 className="h-8 w-8 text-success" />
                        </div>
                        <div>
                            <DialogTitle className="font-display text-2xl font-bold text-foreground">
                                {t('Paiement validé')}
                            </DialogTitle>
                            <p className="mt-1 text-sm text-muted-foreground">{invoice.reference}</p>
                        </div>
                        <p className="font-display text-4xl font-bold tabular-nums text-accent">
                            {formatCurrency(invoice.total)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {t('Paiement :')}{' '}
                            <span className="font-medium text-foreground">
                                {t(paymentMethodLabel(invoice.payment_method))}
                            </span>
                            {(invoice.change_given ?? 0) > 0 && (
                                <>
                                    {' · '}
                                    {t('À rendre :')}{' '}
                                    <span className="font-semibold text-foreground">
                                        {formatCurrency(invoice.change_given ?? 0)}
                                    </span>
                                </>
                            )}
                        </p>
                        {(invoice.tips_total ?? 0) > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {t('Pourboires : {x} — remis directement aux employés.', {
                                    x: formatCurrency(invoice.tips_total ?? 0),
                                })}
                            </p>
                        )}
                        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                            <Button
                                type="button"
                                variant="accent"
                                className="h-14 text-base font-semibold"
                                onClick={() => onPrintTicket(invoice)}
                            >
                                <Printer />
                                {t('Imprimer le ticket')}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-14 text-base font-semibold"
                                onClick={() => onPrintA4(invoice)}
                            >
                                <FileText />
                                {t('Imprimer la facture')}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-14 text-base font-semibold"
                                onClick={() => onViewDetail(invoice)}
                            >
                                <Eye />
                                {t('Voir le détail')}
                            </Button>
                            <Button
                                type="button"
                                variant="accent"
                                className="h-14 text-base font-semibold shadow-glow"
                                onClick={onNewSale}
                            >
                                <Plus />
                                {t('Nouvelle facture')}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
