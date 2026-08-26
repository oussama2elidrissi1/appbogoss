import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Banknote, HandCoins } from 'lucide-react';
import { getAdminPartnerCommissions, getErrorMessage, payPartnerCommissions } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';

export default function PartnerCommissionsAdmin() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [partnerFilter, setPartnerFilter] = useState<number | 'all'>('all');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [payTarget, setPayTarget] = useState<number | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('virement');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');

    const { data, isPending, isError, error, refetch } = useQuery({
        queryKey: ['admin', 'partner-commissions'],
        queryFn: () => getAdminPartnerCommissions(),
    });

    const rows = useMemo(() => {
        if (!data) return [];
        return partnerFilter === 'all' ? data.data : data.data.filter((row) => row.partner_id === partnerFilter);
    }, [data, partnerFilter]);

    const selectedTotal = useMemo(
        () => rows.filter((row) => selected.has(row.id)).reduce((sum, row) => sum + row.amount, 0),
        [rows, selected],
    );

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'partner-commissions'] });
        void queryClient.invalidateQueries({ queryKey: ['partners'] });
    }

    const payMutation = useMutation({
        mutationFn: () =>
            payPartnerCommissions({
                partner_id: payTarget!,
                commission_ids: Array.from(selected),
                payment_method: paymentMethod || null,
                reference: reference.trim() || null,
                notes: notes.trim() || null,
            }),
        onSuccess: () => {
            invalidate();
            setSelected(new Set());
            setPayTarget(null);
            setReference('');
            setNotes('');
        },
    });

    function toggleRow(id: number, partnerId: number) {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                // Mixing partners in one payout would be meaningless — a
                // payout header belongs to exactly one partner.
                for (const row of rows) {
                    if (row.partner_id !== partnerId) next.delete(row.id);
                }
                next.add(id);
            }
            return next;
        });
    }

    const selectedPartnerId = rows.find((row) => selected.has(row.id))?.partner_id ?? null;

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('Commissions partenaires')}</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Commissions validées, en attente de règlement — sélectionnez celles à payer.')}
                </p>
            </div>

            {!isPending && data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Card className="p-4">
                        <p className="text-xs text-muted-foreground">{t('Total dû')}</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums text-accent">
                            {formatCurrency(data.meta.total_due)}
                        </p>
                    </Card>
                    {data.meta.by_partner.slice(0, 3).map((partner) => (
                        <Card key={partner.partner_id} className="p-4">
                            <p className="truncate text-xs text-muted-foreground">{partner.partner_name}</p>
                            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(partner.total)}</p>
                        </Card>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <Select value={String(partnerFilter)} onValueChange={(value) => setPartnerFilter(value === 'all' ? 'all' : Number(value))}>
                    <SelectTrigger className="h-9 w-56">
                        <SelectValue placeholder={t('Tous les partenaires')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('Tous les partenaires')}</SelectItem>
                        {data?.meta.by_partner.map((partner) => (
                            <SelectItem key={partner.partner_id} value={String(partner.partner_id)}>
                                {partner.partner_name} ({partner.count})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {selected.size > 0 && (
                    <Button variant="accent" onClick={() => setPayTarget(selectedPartnerId)}>
                        <HandCoins className="h-4 w-4" />
                        {t('Marquer comme payé')} — {formatCurrency(selectedTotal, { maximumFractionDigits: 2 })} (
                        {selected.size})
                    </Button>
                )}
            </div>

            {isPending ? (
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-14 w-full rounded-md" />
                    ))}
                </div>
            ) : isError ? (
                <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                    <Button variant="accent" className="mt-4" onClick={() => void refetch()}>
                        {t('Réessayer')}
                    </Button>
                </Card>
            ) : rows.length === 0 ? (
                <EmptyState icon={Banknote} title={t('Rien à payer')} description={t('Aucune commission validée en attente.')} />
            ) : (
                <Card className="overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="border-b border-tint/[0.06] bg-tint/[0.02] text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                            <tr>
                                <th className="w-10 px-4 py-3" />
                                <th className="px-4 py-3 font-medium">{t('Partenaire')}</th>
                                <th className="px-4 py-3 font-medium">{t('Client')}</th>
                                <th className="px-4 py-3 font-medium">{t('Service')}</th>
                                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                                <th className="px-4 py-3 text-right font-medium">{t('Commission')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-b border-tint/[0.04] last:border-0">
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(row.id)}
                                            onChange={() => toggleRow(row.id, row.partner_id)}
                                            className="h-4 w-4 accent-[hsl(var(--accent))]"
                                        />
                                    </td>
                                    <td className="px-4 py-3 font-medium">{row.partner_name}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{row.client_name ?? '—'}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{row.service_name ?? '—'}</td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {row.created_at ? formatDate(row.created_at) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-accent">
                                        {formatCurrency(row.amount, { maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}

            <ConfirmDialog
                open={payTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setPayTarget(null);
                }}
                title={t('Marquer ces commissions comme payées ?')}
                description={
                    selected.size > 1
                        ? t('{amount} seront enregistrés comme payés ({n} commissions).', {
                              amount: formatCurrency(selectedTotal, { maximumFractionDigits: 2 }),
                              n: selected.size,
                          })
                        : t('{amount} seront enregistrés comme payés ({n} commission).', {
                              amount: formatCurrency(selectedTotal, { maximumFractionDigits: 2 }),
                              n: selected.size,
                          })
                }
                confirmLabel={t('Confirmer le paiement')}
                variant="accent"
                loading={payMutation.isPending}
                onConfirm={() => payMutation.mutate()}
            >
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="payment-method">{t('Mode de paiement')}</Label>
                            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                <SelectTrigger id="payment-method" className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="virement">{t('Virement')}</SelectItem>
                                    <SelectItem value="cheque">{t('Chèque')}</SelectItem>
                                    <SelectItem value="especes">{t('Espèces')}</SelectItem>
                                    <SelectItem value="autre">{t('Autre')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="payment-reference">{t('Référence')}</Label>
                            <Input
                                id="payment-reference"
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                                placeholder={t('N° de virement...')}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="payment-notes">{t('Notes')}</Label>
                        <Input id="payment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
                    </div>
                    {payMutation.isError && (
                        <p className="text-xs text-destructive">{getErrorMessage(payMutation.error)}</p>
                    )}
                </div>
            </ConfirmDialog>
        </motion.div>
    );
}
