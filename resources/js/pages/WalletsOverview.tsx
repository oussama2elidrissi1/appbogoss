import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    HandCoins,
    Loader2,
    PiggyBank,
    Receipt,
    Send,
    UserSquare2,
    Users,
    Wallet as WalletIcon,
} from 'lucide-react';
import {
    depositToWallet,
    getErrorMessage,
    getWalletById,
    getWalletOverview,
    getWalletTransactions,
    getWalletTransactionsFor,
    transferToAdmin,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { pageFade } from '@/lib/motion';
import type { WalletOverviewRow, WalletTransaction } from '@/types/wallet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * « Trésorerie » — la vue du patron.
 *
 * Elle répond aux questions du cahier des charges sans qu'un seul chiffre soit
 * calculé ici : combien reste chez chaque admin, combien est arrivé chez le
 * patron, combien il a injecté lui-même, combien il a renvoyé, combien est
 * parti aux employés, en fond de caisse ou en dépenses. Et, en ouvrant le
 * détail d'un admin, de quelle journée de caisse vient chaque montant.
 *
 * Deux distinctions structurent l'écran, et aucune des deux n'est cosmétique :
 *
 *  - « reçu des admins » et « apporté par le patron » sont séparés, parce que
 *    l'un est de l'argent du salon et l'autre de l'argent injecté ;
 *  - le fond de caisse a sa propre colonne : c'est de l'argent toujours détenu
 *    par l'admin, jamais une remise au patron.
 */

type OwnerAction = 'deposit' | 'send';

function longDate(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

export default function WalletsOverview() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [openWallet, setOpenWallet] = useState<number | null>(null);
    const [action, setAction] = useState<OwnerAction | null>(null);

    const { data, isPending, isError, error } = useQuery({
        queryKey: ['wallets', 'overview'],
        queryFn: getWalletOverview,
    });

    // L'historique du patron, lu sur SON portefeuille : la même route que
    // n'importe quel admin utilise pour le sien.
    const historyQuery = useQuery({
        queryKey: ['wallet', 'transactions', {}],
        queryFn: () => getWalletTransactions({ limit: 50 }),
    });

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['wallets'] });
        void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    };

    if (openWallet !== null) {
        return <WalletDetail walletId={openWallet} onBack={() => setOpenWallet(null)} />;
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Trésorerie')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t("Où se trouve l'argent : chez le patron, chez chaque admin, en fond de caisse, chez les employés ou déjà dépensé.")}
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
                                {t('Solde patron')}
                            </p>
                            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                                {formatCurrency(data.super_admin.balance, { maximumFractionDigits: 2 })}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {t('Suivi depuis le {date}', { date: longDate(data.start_date) })}
                            </p>

                            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
                                <Stat label={t('Total reçu des Admins')} value={data.super_admin.received_total} />
                                <Stat label={t("Reçu aujourd'hui")} value={data.super_admin.received_today} />
                                <Stat label={t('Reçu ce mois')} value={data.super_admin.received_month} />
                                <Stat label={t('Apporté par le patron')} value={data.super_admin.deposits_total} />
                                <Stat label={t('Renvoyé aux Admins')} value={data.super_admin.sent_to_admins_total} />
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button onClick={() => setAction('deposit')}>
                                    <HandCoins />
                                    {t('Charger mon portefeuille')}
                                </Button>
                                <Button variant="outline" onClick={() => setAction('send')}>
                                    <Send />
                                    {t('Envoyer à un Admin')}
                                </Button>
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
                            icon={<UserSquare2 />}
                            label={t('Payé aux employés')}
                            value={data.employee_payments_total}
                            hint={t("Argent réellement sorti, pas ce qui est dû")}
                        />
                        <SummaryCard
                            icon={<Receipt />}
                            label={t('Total dépenses')}
                            value={data.expenses_total}
                            hint={t('Payées sur les portefeuilles')}
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

                            {data.wallets.length > 0 && (
                                <div className="overflow-x-auto">
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
                                                    {t('Reçu du patron')}
                                                </th>
                                                <th className="px-2 py-2 text-right font-semibold">
                                                    {t('Payé employés')}
                                                </th>
                                                <th className="px-2 py-2 text-right font-semibold">
                                                    {t('Dépenses')}
                                                </th>
                                                <th className="px-2 py-2" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.wallets.map((row) => (
                                                <WalletRow
                                                    key={row.wallet_id}
                                                    row={row}
                                                    onOpen={() => setOpenWallet(row.wallet_id)}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="space-y-2 p-4">
                            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t('Historique du portefeuille patron')}
                            </h3>

                            {historyQuery.isPending && <Skeleton className="h-32 w-full" />}

                            {(historyQuery.data ?? []).length === 0 && !historyQuery.isPending && (
                                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                                    {t('Aucun mouvement.')}
                                </p>
                            )}

                            {(historyQuery.data ?? []).map((transaction) => (
                                <MovementRow key={transaction.id} transaction={transaction} />
                            ))}
                        </CardContent>
                    </Card>
                </>
            )}

            <OwnerActionDialog
                action={action}
                balance={data?.super_admin.balance ?? 0}
                admins={(data?.wallets ?? []).filter((row) => row.type === 'admin')}
                onClose={() => setAction(null)}
                onDone={refresh}
            />
        </motion.div>
    );
}

function WalletRow({ row, onOpen }: { row: WalletOverviewRow; onOpen: () => void }) {
    const { t } = useI18n();
    const cell = (value: number) => (
        <td className="px-2 py-2.5 text-right tabular-nums">
            {formatCurrency(value, { maximumFractionDigits: 2 })}
        </td>
    );

    return (
        <tr className="border-t border-tint/[0.06]">
            <td className="px-2 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="font-medium">{row.user_name}</span>
                    {row.type === 'super_admin' && <Badge variant="accent">{t('Super Admin')}</Badge>}
                </div>
            </td>
            {cell(row.balance)}
            {cell(row.cash_fund_balance)}
            {cell(row.transfers_sent_total)}
            {cell(row.received_from_super_admin_total)}
            {cell(row.employee_payments_total)}
            {cell(row.expenses_total)}
            <td className="px-2 py-2.5 text-right">
                <Button variant="ghost" size="sm" onClick={onOpen}>
                    {t('Détail')}
                </Button>
            </td>
        </tr>
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

// ------------------------------------------------------------ Actions patron

function OwnerActionDialog({
    action,
    balance,
    admins,
    onClose,
    onDone,
}: {
    action: OwnerAction | null;
    balance: number;
    admins: WalletOverviewRow[];
    onClose: () => void;
    onDone: () => void;
}) {
    const { t } = useI18n();
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [walletId, setWalletId] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [confirmDuplicate, setConfirmDuplicate] = useState(false);

    const reset = () => {
        setAmount('');
        setReason('');
        setWalletId('');
        setReference('');
        setNotes('');
        setMessage(null);
        setConfirmDuplicate(false);
    };

    const mutation = useMutation({
        mutationFn: async () => {
            const value = Number(amount);

            if (action === 'deposit') {
                return depositToWallet({
                    amount: value,
                    reason,
                    reference: reference || undefined,
                    notes: notes || undefined,
                });
            }
            return transferToAdmin({
                wallet_id: Number(walletId),
                amount: value,
                description: reason || undefined,
                reference: reference || undefined,
                allow_duplicate: confirmDuplicate || undefined,
            });
        },
        onSuccess: () => {
            onDone();
            reset();
            onClose();
        },
        onError: (error) => {
            setMessage(getErrorMessage(error));
            setConfirmDuplicate(true);
        },
    });

    const isDeposit = action === 'deposit';

    return (
        <Dialog
            open={action !== null}
            onOpenChange={(open) => {
                if (!open) {
                    reset();
                    onClose();
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {t(isDeposit ? 'Charger mon portefeuille' : 'Envoyer à un Admin')}
                    </DialogTitle>
                    <DialogDescription>
                        {t(
                            isDeposit
                                ? "De l'argent qui entre dans le système sans venir d'une journée de caisse. Le motif est obligatoire : c'est tout ce qui restera pour l'expliquer."
                                : "Le montant quitte votre portefeuille et arrive dans celui de l'Admin, en une seule opération.",
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    {!isDeposit && (
                        <div className="space-y-1.5">
                            <Label>{t('Admin destinataire')}</Label>
                            <Select value={walletId} onValueChange={setWalletId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('Sélectionner')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {admins.map((row) => (
                                        <SelectItem key={row.wallet_id} value={String(row.wallet_id)}>
                                            {row.user_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="owner-amount">{t('Montant (DH)')}</Label>
                        <Input
                            id="owner-amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="owner-reason">
                            {t(isDeposit ? 'Motif' : 'Motif (facultatif)')}
                        </Label>
                        <Input
                            id="owner-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder={t(isDeposit ? 'Apport espèces, virement…' : 'Réapprovisionnement caisse…')}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="owner-reference">{t('Référence')}</Label>
                        <Input
                            id="owner-reference"
                            value={reference}
                            onChange={(event) => setReference(event.target.value)}
                            placeholder={t('Facultatif')}
                        />
                    </div>

                    {isDeposit && (
                        <div className="space-y-1.5">
                            <Label htmlFor="owner-notes">{t('Note')}</Label>
                            <Input
                                id="owner-notes"
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                placeholder={t('Facultatif')}
                            />
                        </div>
                    )}

                    {Number(amount) > 0 && (
                        <div className="rounded-md border border-tint/[0.08] bg-tint/[0.02] p-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('Solde actuel')}</span>
                                <span className="tabular-nums">
                                    {formatCurrency(balance, { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="mt-1.5 flex justify-between border-t border-tint/[0.08] pt-1.5 font-semibold">
                                <span>{t('Après opération')}</span>
                                <span
                                    className={cn(
                                        'tabular-nums',
                                        !isDeposit && balance - Number(amount) < 0 && 'text-destructive',
                                    )}
                                >
                                    {formatCurrency(
                                        isDeposit ? balance + Number(amount) : balance - Number(amount),
                                        { maximumFractionDigits: 2 },
                                    )}
                                </span>
                            </div>
                        </div>
                    )}

                    {message && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
                            <p>{message}</p>
                            {!isDeposit && confirmDuplicate && (
                                <p className="mt-1 text-xs">
                                    {t('Renvoyez pour confirmer un second transfert identique.')}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
                        {t('Annuler')}
                    </Button>
                    <Button
                        onClick={() => {
                            setMessage(null);
                            mutation.mutate();
                        }}
                        disabled={
                            mutation.isPending ||
                            Number(amount) <= 0 ||
                            (isDeposit && !reason) ||
                            (!isDeposit && !walletId)
                        }
                    >
                        {mutation.isPending ? <Loader2 className="animate-spin" /> : <WalletIcon />}
                        {t('Valider')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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

                        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
                            <Stat label={t('Résultats de caisse')} value={wallet.cash_registers_total} />
                            <Stat label={t('Envoyé au Super Admin')} value={wallet.transfers_sent_total} />
                            <Stat label={t('Reçu du patron')} value={wallet.received_from_super_admin_total} />
                            <Stat label={t('Payé aux employés')} value={wallet.employee_payments_total} />
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
                        <MovementRow key={transaction.id} transaction={transaction} />
                    ))}
                </CardContent>
            </Card>
        </motion.div>
    );
}

function MovementRow({ transaction }: { transaction: WalletTransaction }) {
    const { t } = useI18n();
    const incoming = transaction.signed_amount >= 0;

    return (
        <div className="flex items-start justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2.5">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{transaction.type_label}</span>
                    {transaction.employee_name && (
                        <Badge variant="outline">{transaction.employee_name}</Badge>
                    )}
                    {transaction.category_label && (
                        <Badge variant="outline">{transaction.category_label}</Badge>
                    )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                        transaction.source?.label,
                        transaction.description,
                        transaction.counterparty_name,
                        transaction.performed_by,
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(transaction.occurred_at)}
                </p>
            </div>
            <div className="shrink-0 text-right">
                <p
                    className={cn(
                        'text-sm font-semibold tabular-nums',
                        incoming ? 'text-success' : 'text-foreground',
                    )}
                >
                    {incoming ? '+' : '−'}
                    {formatCurrency(Math.abs(transaction.signed_amount), { maximumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-muted-foreground">
                    {t('Solde')}&nbsp;:{' '}
                    {formatCurrency(transaction.balance_after, { maximumFractionDigits: 2 })}
                </p>
            </div>
        </div>
    );
}
