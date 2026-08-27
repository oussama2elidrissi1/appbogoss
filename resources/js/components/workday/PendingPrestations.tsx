import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Wallet } from 'lucide-react';
import { confirmPrestationPayment, getErrorMessage, getPendingPrestations } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency, formatTime, cn } from '@/lib/utils';
import { workDayKeys } from '@/hooks/useWorkDay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { Prestation, PrestationPaymentMethod } from '@/types/prestation';

const PAYMENT_METHODS: Array<{ value: PrestationPaymentMethod; label: string }> = [
    { value: 'especes', label: 'Espèces' },
    { value: 'carte', label: 'Carte' },
    { value: 'virement', label: 'Virement' },
    { value: 'mixte', label: 'Mixte' },
    { value: 'autre', label: 'Autre' },
];

export function PendingPrestations() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [confirming, setConfirming] = useState<Prestation | null>(null);

    const { data: prestations, isPending } = useQuery({
        queryKey: ['prestations', 'pending'],
        queryFn: getPendingPrestations,
        refetchInterval: 8000,
    });

    function refresh() {
        void queryClient.invalidateQueries({ queryKey: ['prestations'] });
        void queryClient.invalidateQueries({ queryKey: workDayKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    if (isPending) {
        return (
            <Card className="space-y-3 p-5">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-16 w-full" />
            </Card>
        );
    }

    if (!prestations || prestations.length === 0) return null;

    return (
        <>
            <Card className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{t('Prestations en attente de paiement')}</p>
                    <Badge variant="accent">{prestations.length}</Badge>
                </div>
                <div className="space-y-2">
                    {prestations.map((prestation) => (
                        <div
                            key={prestation.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-tint/[0.08] bg-tint/[0.02] px-3.5 py-3"
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                    {prestation.reference} · {prestation.employee_name}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {prestation.client_name ?? t('Client de passage')} · {t('envoyée à')}{' '}
                                    {prestation.validated_at ? formatTime(prestation.validated_at) : '--:--'}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold tabular-nums text-accent">
                                    {formatCurrency(prestation.total)}
                                </span>
                                <Button type="button" size="sm" variant="accent" onClick={() => setConfirming(prestation)}>
                                    <Wallet className="h-3.5 w-3.5" />
                                    {t('Encaisser')}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            <ConfirmPaymentDialog
                prestation={confirming}
                onOpenChange={(open) => {
                    if (!open) setConfirming(null);
                }}
                onConfirmed={() => {
                    setConfirming(null);
                    refresh();
                }}
            />
        </>
    );
}

function ConfirmPaymentDialog({
    prestation,
    onOpenChange,
    onConfirmed,
}: {
    prestation: Prestation | null;
    onOpenChange: (open: boolean) => void;
    onConfirmed: () => void;
}) {
    const { t } = useI18n();
    const [method, setMethod] = useState<PrestationPaymentMethod>('especes');
    const [amountReceived, setAmountReceived] = useState('');

    const total = prestation?.total ?? 0;
    const received = Number(amountReceived) || 0;
    const change = useMemo(() => Math.max(0, received - total), [received, total]);

    const mutation = useMutation({
        mutationFn: () =>
            confirmPrestationPayment(prestation!.id, {
                payment_method: method,
                amount_received: method === 'especes' && amountReceived !== '' ? received : null,
                change_given: method === 'especes' && amountReceived !== '' ? change : null,
            }),
        onSuccess: onConfirmed,
    });

    return (
        <Dialog
            open={prestation !== null}
            onOpenChange={(open) => {
                onOpenChange(open);
                if (!open) {
                    setMethod('especes');
                    setAmountReceived('');
                    mutation.reset();
                }
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('Confirmer le paiement')}</DialogTitle>
                    <DialogDescription>
                        {prestation?.reference} — {formatCurrency(total)} {t('à encaisser.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {PAYMENT_METHODS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setMethod(option.value)}
                                className={cn(
                                    'rounded-md border px-3 py-2.5 text-sm font-medium transition-all duration-200',
                                    method === option.value
                                        ? 'border-accent/60 bg-accent/[0.12] text-foreground'
                                        : 'border-tint/[0.08] bg-tint/[0.03] text-muted-foreground hover:border-accent/30',
                                )}
                            >
                                {t(option.label)}
                            </button>
                        ))}
                    </div>

                    {method === 'especes' && (
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                {t('Montant reçu')}
                            </label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={amountReceived}
                                onChange={(event) => setAmountReceived(event.target.value)}
                                placeholder={String(total)}
                            />
                            {amountReceived !== '' && (
                                <p className="text-xs text-muted-foreground">
                                    {t('Monnaie à rendre :')} <span className="font-semibold text-foreground">{formatCurrency(change)}</span>
                                </p>
                            )}
                        </div>
                    )}

                    {mutation.isError && (
                        <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                            <p className="text-sm text-destructive">{getErrorMessage(mutation.error)}</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Annuler')}
                    </Button>
                    <Button type="button" variant="accent" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                        {mutation.isPending && <Loader2 className="animate-spin" />}
                        {t('Confirmer le paiement')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
