import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowRightCircle, Inbox, Loader2, PlusCircle } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { getPos2PendingPrestations, importPos2Pending, pos2Keys } from '@/lib/pos2Api';
import { formatCurrency } from '@/lib/utils';
import type { Pos2Invoice } from '@/types/pos2';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Pos2PendingPrestationsProps {
    /** Facture V2 actuellement ouverte à l'écran (cible de la fusion), le cas échéant. */
    currentInvoice: Pos2Invoice | null;
    onImported: (invoice: Pos2Invoice) => void;
}

/**
 * Prestations envoyées en caisse par les employés depuis Mon Espace
 * (workflow V1). La caisse V2 peut les reprendre telles quelles ou les
 * ajouter à la facture du client en cours — la prestation quitte alors la
 * file V1 atomiquement (aucun double encaissement possible).
 */
export function Pos2PendingPrestations({ currentInvoice, onImported }: Pos2PendingPrestationsProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [error, setError] = useState<string | null>(null);

    const { data: pending } = useQuery({
        queryKey: pos2Keys.pending,
        queryFn: getPos2PendingPrestations,
        refetchInterval: 10_000,
    });

    const importMutation = useMutation({
        mutationFn: ({ prestationId, targetId }: { prestationId: number; targetId: number | null }) =>
            importPos2Pending(prestationId, targetId),
        onSuccess: (invoice) => {
            setError(null);
            void queryClient.invalidateQueries({ queryKey: pos2Keys.all });
            onImported(invoice);
        },
        onError: (err) => setError(getErrorMessage(err)),
    });

    if (!pending || pending.length === 0) return null;

    const canMerge =
        currentInvoice !== null &&
        ['draft', 'in_progress', 'services_done'].includes(currentInvoice.status);

    return (
        <Card className="border-accent/30 bg-accent/[0.04]">
            <CardContent className="space-y-2.5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Inbox className="h-4 w-4 text-accent" />
                    {t('Prestations envoyées par les employés')}
                    <span className="rounded-full border border-accent/30 bg-accent/[0.12] px-2 py-0.5 text-[11px] font-bold tabular-nums text-accent">
                        {pending.length}
                    </span>
                </p>

                <ul className="space-y-2">
                    {pending.map((prestation) => (
                        <li
                            key={prestation.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-tint/[0.08] bg-background/60 px-3.5 py-2.5"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                                    <span className="font-semibold tabular-nums text-foreground">
                                        {prestation.reference}
                                    </span>
                                    {prestation.sent_time && (
                                        <span className="tabular-nums text-muted-foreground">{prestation.sent_time}</span>
                                    )}
                                    <span className="truncate text-foreground">{prestation.client_name}</span>
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                    {prestation.employee_name && (
                                        <span className="inline-flex items-center gap-1">
                                            <span
                                                className="inline-block h-2 w-2 rounded-full"
                                                style={{ backgroundColor: prestation.employee_avatar_color ?? '#C8A24C' }}
                                            />
                                            {prestation.employee_name}
                                        </span>
                                    )}
                                    <span className="truncate">· {prestation.services_label || '—'}</span>
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <span className="text-sm font-semibold tabular-nums text-foreground">
                                    {formatCurrency(prestation.total)}
                                </span>
                                {canMerge && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-9"
                                        disabled={importMutation.isPending}
                                        onClick={() =>
                                            importMutation.mutate({
                                                prestationId: prestation.id,
                                                targetId: currentInvoice?.id ?? null,
                                            })
                                        }
                                    >
                                        <PlusCircle />
                                        {t('Ajouter à la facture')}
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="accent"
                                    className="h-9"
                                    disabled={importMutation.isPending}
                                    onClick={() =>
                                        importMutation.mutate({ prestationId: prestation.id, targetId: null })
                                    }
                                >
                                    {importMutation.isPending ? <Loader2 className="animate-spin" /> : <ArrowRightCircle />}
                                    {t('Reprendre en V2')}
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>

                {error && (
                    <p className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3 py-2 text-xs text-destructive">
                        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                        {error}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
