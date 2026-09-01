import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, PiggyBank, Receipt, Users } from 'lucide-react';
import {
    getErrorMessage,
    getWalletById,
    getWalletOverview,
    getWalletTransactionsFor,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { pageFade } from '@/lib/motion';
import type { WalletTransaction } from '@/types/wallet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * « Trésorerie » — la vue du patron.
 *
 * Elle répond aux six questions du cahier des charges sans qu'un seul chiffre
 * soit calculé ici : combien reste chez chaque admin, combien est arrivé chez
 * le patron (total, aujourd'hui, ce mois), combien dort en fond de caisse,
 * combien est parti en dépenses, et — en ouvrant le détail d'un admin — de
 * quelle journée de caisse vient chaque montant.
 *
 * Le fond de caisse a sa propre colonne. Il ne se confond jamais avec ce qui a
 * été remis au patron : c'est de l'argent toujours détenu par l'admin.
 */
export default function WalletsOverview() {
    const { t } = useI18n();
    const [openWallet, setOpenWallet] = useState<number | null>(null);

    const { data, isPending, isError, error } = useQuery({
        queryKey: ['wallets', 'overview'],
        queryFn: getWalletOverview,
    });

    if (openWallet !== null) {
        return <WalletDetail walletId={openWallet} onBack={() => setOpenWallet(null)} />;
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Trésorerie')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t("Où se trouve l'argent : chez le patron, chez chaque admin, en fond de caisse ou déjà dépensé.")}
                </p>
            </div>

            {isPending && <Skeleton className="h-40 w-full" />}

            {isError && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {getErrorMessage(error)}
                </p>
            )}

            {data && (
                <>
                    <Card>
                        <CardContent className="p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {t('Portefeuille Super Admin')}
                            </p>
                            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                                {formatCurrency(data.super_admin.balance, { maximumFractionDigits: 2 })}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {t('Suivi depuis le {date}', {
                                    date: new Date(`${data.start_date}T00:00:00`).toLocaleDateString('fr-FR', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                    }),
                                })}
                            </p>

                            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
                                <Stat label={t('Total reçu')} value={data.super_admin.received_total} />
                                <Stat label={t("Reçu aujourd'hui")} value={data.super_admin.received_today} />
                                <Stat label={t('Reçu ce mois')} value={data.super_admin.received_month} />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryCard
                            icon={<Users />}
                            label={t('Encore détenu par les Admins')}
                            value={data.admins.balance_total}
                            hint={t('{count} portefeuille(s)', { count: String(data.admins.count) })}
                        />
                        <SummaryCard
                            icon={<PiggyBank />}
                            label={t('Total fonds de caisse')}
                            value={data.cash_fund_total}
                            hint={t("Argent détenu, jamais remis au patron")}
                        />
                        <SummaryCard
                            icon={<Receipt />}
                            label={t('Total dépenses')}
                            value={data.expenses_total}
                            hint={t('Payées sur les portefeuilles')}
                        />
                        <SummaryCard
                            icon={<Building2 />}
                            label={t('Résultats de caisse encaissés')}
                            value={data.admins.cash_registers_total}
                            hint={t('Depuis le démarrage du portefeuille')}
                        />
                    </div>

                    <Card>
                        <CardContent className="p-4">
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t('Par administrateur')}
                            </h3>

                            {data.wallets.length === 0 && (
                                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                                    {t("Aucun portefeuille pour l'instant. Le premier naît à la clôture d'une journée de caisse.")}
                                </p>
                            )}

                            <div className="overflow-x-auto">
                                {data.wallets.length > 0 && (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                                                <th className="px-2 py-2 font-semibold">{t('Compte')}</th>
                                                <th className="px-2 py-2 text-right font-semibold">
                                                    {t('Disponible')}
                                                </th>
                                                <th className="px-2 py-2 text-right font-semibold">
                                                    {t('Fond de caisse')}
                                                </th>
                                                <th className="px-2 py-2 text-right font-semibold">
                                                    {t('Envoyé au Super Admin')}
                                                </th>
                                                <th className="px-2 py-2 text-right font-semibold">
                                                    {t('Dépenses')}
                                                </th>
                                                <th className="px-2 py-2" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.wallets.map((row) => (
                                                <tr
                                                    key={row.wallet_id}
                                                    className="border-t border-tint/[0.06]"
                                                >
                                                    <td className="px-2 py-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium">{row.user_name}</span>
                                                            {row.type === 'super_admin' && (
                                                                <Badge variant="accent">
                                                                    {t('Super Admin')}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums">
                                                        {formatCurrency(row.balance, {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums">
                                                        {formatCurrency(row.cash_fund_balance, {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums">
                                                        {formatCurrency(row.transfers_sent_total, {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right tabular-nums">
                                                        {formatCurrency(row.expenses_total, {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setOpenWallet(row.wallet_id)}
                                                        >
                                                            {t('Détail')}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </motion.div>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-md border border-tint/[0.06] bg-tint/[0.025] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(value, { maximumFractionDigits: 2 })}
            </p>
        </div>
    );
}

function SummaryCard({
    icon,
    label,
    value,
    hint,
}: {
    icon: ReactNode;
    label: string;
    value: number;
    hint: string;
}) {
    return (
        <Card>
            <CardContent className="p-4">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <span className="[&_svg]:size-3.5">{icon}</span>
                    {label}
                </p>
                <p className="mt-1.5 text-xl font-semibold tabular-nums">
                    {formatCurrency(value, { maximumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            </CardContent>
        </Card>
    );
}

// ------------------------------------------------------------------- Détail

function WalletDetail({ walletId, onBack }: { walletId: number; onBack: () => void }) {
    const { t } = useI18n();

    const walletQuery = useQuery({
        queryKey: ['wallets', walletId],
        queryFn: () => getWalletById(walletId),
    });
    const historyQuery = useQuery({
        queryKey: ['wallets', walletId, 'transactions'],
        queryFn: () => getWalletTransactionsFor(walletId),
    });

    const wallet = walletQuery.data;

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft />
                    {t('Retour')}
                </Button>
                <h2 className="text-xl font-semibold tracking-tight">
                    {wallet?.user_name ?? t('Portefeuille')}
                </h2>
            </div>

            {walletQuery.isPending && <Skeleton className="h-32 w-full" />}

            {walletQuery.isError && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {getErrorMessage(walletQuery.error)}
                </p>
            )}

            {wallet && (
                <Card>
                    <CardContent className="p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {t('Solde disponible')}
                        </p>
                        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                            {formatCurrency(wallet.balance, { maximumFractionDigits: 2 })}
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                            <Stat label={t('Résultats de caisse')} value={wallet.cash_registers_total} />
                            <Stat label={t('Envoyé au Super Admin')} value={wallet.transfers_sent_total} />
                            <Stat label={t('Dépenses')} value={wallet.expenses_total} />
                            <Stat label={t('Fond de caisse')} value={wallet.cash_fund_balance} />
                        </div>

                        {!wallet.reconciliation.balanced && (
                            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                                {t('Anomalie : le solde ne correspond pas à la somme des mouvements.')}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="space-y-2 p-4">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('Historique complet')}
                    </h3>

                    {historyQuery.isPending && <Skeleton className="h-40 w-full" />}

                    {(historyQuery.data ?? []).length === 0 && !historyQuery.isPending && (
                        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            {t('Aucun mouvement.')}
                        </p>
                    )}

                    {(historyQuery.data ?? []).map((transaction) => (
                        <DetailRow key={transaction.id} transaction={transaction} />
                    ))}
                </CardContent>
            </Card>
        </motion.div>
    );
}

function DetailRow({ transaction }: { transaction: WalletTransaction }) {
    const { t } = useI18n();
    const incoming = transaction.signed_amount >= 0;

    return (
        <div className="flex items-start justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2.5">
            <div className="min-w-0">
                <p className="text-sm font-medium">{transaction.type_label}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[transaction.source?.label, transaction.description, transaction.performed_by]
                        .filter(Boolean)
                        .join(' · ')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(transaction.occurred_at)}
                </p>
            </div>
            <p
                className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    incoming ? 'text-success' : 'text-foreground',
                )}
            >
                {incoming ? '+' : '−'}
                {formatCurrency(Math.abs(transaction.signed_amount), { maximumFractionDigits: 2 })}
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    {t('Solde')} {formatCurrency(transaction.balance_after, { maximumFractionDigits: 2 })}
                </span>
            </p>
        </div>
    );
}
