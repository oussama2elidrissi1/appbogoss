import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    ArrowDownLeft,
    ArrowUpRight,
    Banknote,
    Loader2,
    PiggyBank,
    Receipt,
    RotateCcw,
    Send,
    UserSquare2,
    Wallet as WalletIcon,
} from 'lucide-react';
import {
    allocateCashFund,
    createWalletExpense,
    getEmployees,
    getErrorMessage,
    getWallet,
    getWalletTransactions,
    payEmployeeFromWallet,
    returnCashFund,
    transferToSuperAdmin,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { pageFade } from '@/lib/motion';
import type {
    EmployeePaymentKind,
    WalletTransaction,
    WalletTransactionFilters,
    WalletTransactionType,
} from '@/types/wallet';
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
 * « Mon portefeuille » — où est l'argent de l'admin, sans un seul calcul mental.
 *
 * Rien n'est additionné ici : chaque total vient du serveur, qui l'agrège
 * depuis le ledger. C'est la seule façon d'être certain que ce que montre cet
 * écran, ce que montre la vue du patron et ce que montre l'application mobile
 * disent tous la même chose.
 *
 * Le fond de caisse est affiché à part du disponible, et jamais additionné au
 * total « envoyé au Super Admin » : la confusion entre les deux est exactement
 * l'erreur que ce module existe pour supprimer.
 */

const TYPE_OPTIONS: { value: WalletTransactionType; label: string }[] = [
    { value: 'CASH_REGISTER_RESULT', label: 'Résultat de caisse' },
    { value: 'TRANSFER_TO_SUPER_ADMIN', label: 'Envoi au Super Admin' },
    { value: 'TRANSFER_TO_ADMIN', label: 'Reçu du Super Admin' },
    { value: 'EMPLOYEE_PAYMENT', label: 'Paiement employé' },
    { value: 'EXPENSE', label: 'Dépense' },
    { value: 'CASH_FUND', label: 'Fond de caisse' },
    { value: 'CASH_FUND_RETURN', label: 'Reprise de fond de caisse' },
    { value: 'ADJUSTMENT', label: 'Ajustement' },
];

/**
 * Motifs de paiement d'un employé.
 *
 * « Avance » est signalée à part : c'est la seule qui laisse une dette. Les
 * autres ne sont que des mouvements — ce qui était dû l'était déjà ailleurs.
 */
const PAYMENT_KINDS: { value: EmployeePaymentKind; label: string; hint?: string }[] = [
    { value: 'salary', label: 'Salaire' },
    { value: 'commission', label: 'Commission' },
    {
        value: 'advance',
        label: 'Avance',
        hint: "L'employé reste redevable : elle sera déduite de sa prochaine paie.",
    },
    { value: 'bonus', label: 'Prime' },
    { value: 'other', label: 'Autre' },
];

const EXPENSE_CATEGORIES = [
    { value: 'assurance', label: 'Assurance' },
    { value: 'materiel', label: 'Matériel' },
    { value: 'reparations', label: 'Réparations' },
    { value: 'fournisseurs', label: 'Fournisseurs' },
    { value: 'loyer', label: 'Loyer' },
    { value: 'salaires', label: 'Salaires' },
    { value: 'general', label: 'Divers' },
];

const ALL = '__all__';

type WalletActionKind = 'transfer' | 'employee' | 'expense' | 'fund' | 'fund-return';

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function longDate(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

export default function WalletPage() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [action, setAction] = useState<WalletActionKind | null>(null);
    const [filters, setFilters] = useState<WalletTransactionFilters>({});

    const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWallet });
    const historyQuery = useQuery({
        queryKey: ['wallet', 'transactions', filters],
        queryFn: () => getWalletTransactions(filters),
    });

    const wallet = walletQuery.data;

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['wallet'] });
        // Les journees de caisse portent le statut « credite » : elles doivent
        // se rafraichir avec le portefeuille.
        void queryClient.invalidateQueries({ queryKey: ['work-days'] });
    };

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Mon portefeuille')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t("L'argent qui vous reste, ce que vous avez remis au patron, vos dépenses et votre fond de caisse.")}
                </p>
            </div>

            {walletQuery.isPending && <Skeleton className="h-40 w-full" />}

            {walletQuery.isError && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {getErrorMessage(walletQuery.error)}
                </p>
            )}

            {wallet && (
                <>
                    <Card>
                        <CardContent className="p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {t('Solde du portefeuille')}
                            </p>
                            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                                {formatCurrency(wallet.balance, { maximumFractionDigits: 2 })}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {t('Suivi du portefeuille depuis le {date}', {
                                    date: longDate(wallet.start_date),
                                })}
                                {' · '}
                                {t('Les rapports antérieurs restent disponibles dans « Rapports ».')}
                            </p>

                            {!wallet.reconciliation.balanced && (
                                <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                                    {t('Anomalie : le solde ne correspond pas à la somme des mouvements. Prévenez le Super Admin.')}
                                </p>
                            )}

                            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
                                <Stat
                                    label={t('Résultats de caisse reçus')}
                                    value={wallet.cash_registers_total}
                                    icon={<ArrowDownLeft className="text-success" />}
                                />
                                <Stat
                                    label={t('Envoyé au Super Admin')}
                                    value={wallet.transfers_sent_total}
                                    icon={<ArrowUpRight className="text-muted-foreground" />}
                                />
                                <Stat
                                    label={t('Dépenses')}
                                    value={wallet.expenses_total}
                                    icon={<Receipt className="text-muted-foreground" />}
                                />
                                <Stat
                                    label={t('Fond de caisse')}
                                    value={wallet.cash_fund_balance}
                                    icon={<PiggyBank className="text-accent" />}
                                />
                                <Stat
                                    label={t('Solde disponible')}
                                    value={wallet.balance}
                                    icon={<WalletIcon className="text-accent" />}
                                    strong
                                />
                            </div>

                            <p className="mt-3 text-xs text-muted-foreground">
                                {t('Total détenu (disponible + fond de caisse)')}&nbsp;:{' '}
                                <span className="font-semibold tabular-nums text-foreground">
                                    {formatCurrency(wallet.total_held, { maximumFractionDigits: 2 })}
                                </span>
                            </p>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button onClick={() => setAction('transfer')}>
                                    <Send />
                                    {t('Envoyer au Super Admin')}
                                </Button>
                                <Button variant="outline" onClick={() => setAction('employee')}>
                                    <UserSquare2 />
                                    {t('Payer un employé')}
                                </Button>
                                <Button variant="outline" onClick={() => setAction('expense')}>
                                    <Receipt />
                                    {t('Ajouter une dépense')}
                                </Button>
                                <Button variant="outline" onClick={() => setAction('fund')}>
                                    <PiggyBank />
                                    {t('Affecter au fond de caisse')}
                                </Button>
                                {wallet.cash_fund_balance > 0 && (
                                    <Button variant="ghost" onClick={() => setAction('fund-return')}>
                                        <RotateCcw />
                                        {t('Reprendre du fond de caisse')}
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <HistorySection
                        filters={filters}
                        onFiltersChange={setFilters}
                        transactions={historyQuery.data ?? []}
                        isPending={historyQuery.isPending}
                        isError={historyQuery.isError}
                        error={historyQuery.error}
                    />
                </>
            )}

            <ActionDialog
                action={action}
                balance={wallet?.balance ?? 0}
                onClose={() => setAction(null)}
                onDone={refresh}
            />
        </motion.div>
    );
}

function Stat({
    label,
    value,
    icon,
    strong = false,
}: {
    label: string;
    value: number;
    icon: ReactNode;
    strong?: boolean;
}) {
    return (
        <div className="rounded-md border border-tint/[0.06] bg-tint/[0.025] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <span className="[&_svg]:size-3.5">{icon}</span>
                {label}
            </p>
            <p
                className={cn(
                    'mt-1 tabular-nums text-foreground',
                    strong ? 'text-base font-semibold' : 'text-sm font-semibold',
                )}
            >
                {formatCurrency(value, { maximumFractionDigits: 2 })}
            </p>
        </div>
    );
}

// ---------------------------------------------------------------- Historique

function HistorySection({
    filters,
    onFiltersChange,
    transactions,
    isPending,
    isError,
    error,
}: {
    filters: WalletTransactionFilters;
    onFiltersChange: (filters: WalletTransactionFilters) => void;
    transactions: WalletTransaction[];
    isPending: boolean;
    isError: boolean;
    error: unknown;
}) {
    const { t } = useI18n();

    const set = (patch: Partial<WalletTransactionFilters>) =>
        onFiltersChange({ ...filters, ...patch });

    const hasFilters = useMemo(
        () => Object.values(filters).some((value) => value !== '' && value !== undefined),
        [filters],
    );

    return (
        <Card>
            <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <h3 className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('Historique des mouvements')}
                    </h3>

                    <Field label={t('Du')}>
                        <Input
                            type="date"
                            value={filters.from ?? ''}
                            onChange={(event) => set({ from: event.target.value })}
                        />
                    </Field>
                    <Field label={t('Au')}>
                        <Input
                            type="date"
                            value={filters.to ?? ''}
                            onChange={(event) => set({ to: event.target.value })}
                        />
                    </Field>
                    <Field label={t('Type')}>
                        <Select
                            value={filters.type || ALL}
                            onValueChange={(value) =>
                                set({ type: value === ALL ? '' : (value as WalletTransactionType) })
                            }
                        >
                            <SelectTrigger className="w-52">
                                <SelectValue placeholder={t('Tous')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>{t('Tous les types')}</SelectItem>
                                {TYPE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {t(option.label)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('Montant min.')}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="w-28"
                            value={filters.min_amount ?? ''}
                            onChange={(event) =>
                                set({ min_amount: event.target.value === '' ? '' : Number(event.target.value) })
                            }
                        />
                    </Field>
                    <Field label={t('Montant max.')}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="w-28"
                            value={filters.max_amount ?? ''}
                            onChange={(event) =>
                                set({ max_amount: event.target.value === '' ? '' : Number(event.target.value) })
                            }
                        />
                    </Field>
                    <Field label={t('Journée de caisse')}>
                        <Input
                            type="number"
                            min={1}
                            className="w-28"
                            placeholder="ID"
                            value={filters.work_day_id ?? ''}
                            onChange={(event) =>
                                set({ work_day_id: event.target.value === '' ? '' : Number(event.target.value) })
                            }
                        />
                    </Field>

                    {hasFilters && (
                        <Button variant="ghost" size="sm" onClick={() => onFiltersChange({})}>
                            {t('Réinitialiser')}
                        </Button>
                    )}
                </div>

                {isPending && <Skeleton className="h-40 w-full" />}

                {isError && (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        {getErrorMessage(error)}
                    </p>
                )}

                {!isPending && !isError && transactions.length === 0 && (
                    <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        {t('Aucun mouvement sur cette sélection.')}
                    </p>
                )}

                <div className="space-y-2">
                    {transactions.map((transaction) => (
                        <TransactionRow key={transaction.id} transaction={transaction} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
            {children}
        </div>
    );
}

function TransactionRow({ transaction }: { transaction: WalletTransaction }) {
    const { t } = useI18n();
    const incoming = transaction.signed_amount >= 0;

    return (
        <div className="flex items-start justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2.5">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{transaction.type_label}</span>
                    {transaction.bucket === 'cash_fund' && (
                        <Badge variant="outline">{t('Fond de caisse')}</Badge>
                    )}
                    {transaction.reverses_transaction_id !== null && (
                        <Badge variant="destructive">{t('Correction')}</Badge>
                    )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                        transaction.source?.label,
                        transaction.description,
                        transaction.counterparty_name,
                        transaction.reference,
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

// ------------------------------------------------------------------- Actions

function ActionDialog({
    action,
    balance,
    onClose,
    onDone,
}: {
    action: WalletActionKind | null;
    balance: number;
    onClose: () => void;
    onDone: () => void;
}) {
    const { t } = useI18n();
    const [amount, setAmount] = useState('');
    const [label, setLabel] = useState('');
    const [category, setCategory] = useState('general');
    const [spentOn, setSpentOn] = useState(today());
    const [notes, setNotes] = useState('');
    const [reference, setReference] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [kind, setKind] = useState<EmployeePaymentKind>('salary');
    const [period, setPeriod] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    // Le serveur refuse un envoi identique dans la minute ; cette case relance
    // la meme demande en l'assumant, plutot que de contourner le garde-fou.
    const [confirmDuplicate, setConfirmDuplicate] = useState(false);

    // Chargee seulement quand la modale « Payer un employe » est ouverte : la
    // page ne doit pas payer une requete de plus pour un bouton non clique.
    const employeesQuery = useQuery({
        queryKey: ['employees'],
        queryFn: () => getEmployees(),
        enabled: action === 'employee',
    });

    const reset = () => {
        setAmount('');
        setLabel('');
        setCategory('general');
        setSpentOn(today());
        setNotes('');
        setReference('');
        setEmployeeId('');
        setKind('salary');
        setPeriod('');
        setMessage(null);
        setConfirmDuplicate(false);
    };

    const mutation = useMutation({
        mutationFn: async () => {
            const value = Number(amount);

            if (action === 'transfer') {
                return transferToSuperAdmin({
                    amount: value,
                    description: notes || undefined,
                    reference: reference || undefined,
                    allow_duplicate: confirmDuplicate || undefined,
                });
            }
            if (action === 'employee') {
                return payEmployeeFromWallet({
                    employee_id: Number(employeeId),
                    amount: value,
                    kind,
                    period: period || undefined,
                    note: notes || undefined,
                    reference: reference || undefined,
                    acknowledge_duplicate: confirmDuplicate || undefined,
                });
            }
            if (action === 'expense') {
                return createWalletExpense({
                    amount: value,
                    label,
                    category,
                    spent_on: spentOn,
                    notes: notes || undefined,
                    reference: reference || undefined,
                });
            }
            if (action === 'fund') {
                return allocateCashFund({ amount: value, description: notes || undefined });
            }
            return returnCashFund({ amount: value, description: notes || undefined });
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

    const titles: Record<string, { title: string; description: string }> = {
        transfer: {
            title: 'Envoyer au Super Admin',
            description:
                'Le montant quitte votre portefeuille et arrive dans celui du patron, en une seule opération.',
        },
        employee: {
            title: 'Payer un employé',
            description:
                "L'argent sort de votre portefeuille. Les commissions et la paie mensuelle continuent de dire ce qui est dû : ceci enregistre ce qui est réellement sorti.",
        },
        expense: {
            title: 'Ajouter une dépense',
            description:
                "Une dépense payée sur l'argent que vous détenez. Elle n'entre pas dans les dépenses de la caisse.",
        },
        fund: {
            title: 'Affecter au fond de caisse',
            description:
                "L'argent reste chez vous : il passe simplement du disponible au fond de caisse.",
        },
        'fund-return': {
            title: 'Reprendre du fond de caisse',
            description: 'Le montant repasse du fond de caisse vers votre disponible.',
        },
    };

    const copy = action ? titles[action] : null;

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
                    <DialogTitle>{t(copy?.title ?? '')}</DialogTitle>
                    <DialogDescription>{t(copy?.description ?? '')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="wallet-amount">{t('Montant (DH)')}</Label>
                        <Input
                            id="wallet-amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            autoFocus
                        />
                    </div>

                    {action === 'employee' && (
                        <>
                            <div className="space-y-1.5">
                                <Label>{t('Employé')}</Label>
                                <Select value={employeeId} onValueChange={setEmployeeId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('Sélectionner')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {/* Le serveur exclut deja les pseudo-employes
                                            « entreprise » (vitrine, refrigerateur) ;
                                            les comptes inactifs restent listes, un
                                            depart en cours d'annee doit pouvoir etre
                                            solde. */}
                                        {(employeesQuery.data ?? []).map((employee) => (
                                            <SelectItem
                                                key={employee.id}
                                                value={String(employee.id)}
                                            >
                                                {employee.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('Type')}</Label>
                                <Select
                                    value={kind}
                                    onValueChange={(value) => setKind(value as EmployeePaymentKind)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAYMENT_KINDS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {t(option.label)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {PAYMENT_KINDS.find((option) => option.value === kind)?.hint && (
                                    <p className="text-xs text-muted-foreground">
                                        {t(PAYMENT_KINDS.find((option) => option.value === kind)!.hint!)}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="wallet-period">{t('Période concernée')}</Label>
                                <Input
                                    id="wallet-period"
                                    type="month"
                                    value={period}
                                    onChange={(event) => setPeriod(event.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {t("Le mois que ce paiement solde. Facultatif — le mouvement, lui, est daté d'aujourd'hui.")}
                                </p>
                            </div>
                        </>
                    )}

                    {action === 'expense' && (
                        <>
                            <div className="space-y-1.5">
                                <Label htmlFor="wallet-label">{t('Motif')}</Label>
                                <Input
                                    id="wallet-label"
                                    value={label}
                                    onChange={(event) => setLabel(event.target.value)}
                                    placeholder={t('Assurance, batterie, tailleur…')}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('Catégorie')}</Label>
                                <Select value={category} onValueChange={setCategory}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {EXPENSE_CATEGORIES.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {t(option.label)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="wallet-date">{t('Date')}</Label>
                                <Input
                                    id="wallet-date"
                                    type="date"
                                    value={spentOn}
                                    onChange={(event) => setSpentOn(event.target.value)}
                                />
                            </div>
                        </>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="wallet-notes">{t('Note')}</Label>
                        <Input
                            id="wallet-notes"
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder={t('Facultatif')}
                        />
                    </div>

                    {(action === 'transfer' || action === 'expense') && (
                        <div className="space-y-1.5">
                            <Label htmlFor="wallet-reference">{t('Référence')}</Label>
                            <Input
                                id="wallet-reference"
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                                placeholder={t('N° de facture, reçu…')}
                            />
                        </div>
                    )}

                    {/* Le solde apres coup, avant de confirmer : c'est la
                        verification que personne ne fait de tete. */}
                    {Number(amount) > 0 && action !== 'fund-return' && (
                        <div className="rounded-md border border-tint/[0.08] bg-tint/[0.02] p-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('Solde actuel')}</span>
                                <span className="tabular-nums">
                                    {formatCurrency(balance, { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="mt-1 flex justify-between">
                                <span className="text-muted-foreground">
                                    {action === 'fund' ? t('Affectation') : t('Montant')}
                                </span>
                                <span className="tabular-nums">
                                    −{formatCurrency(Number(amount), { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="mt-1.5 flex justify-between border-t border-tint/[0.08] pt-1.5 font-semibold">
                                <span>{t('Après opération')}</span>
                                <span
                                    className={cn(
                                        'tabular-nums',
                                        balance - Number(amount) < 0 && 'text-destructive',
                                    )}
                                >
                                    {formatCurrency(balance - Number(amount), {
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                            </div>
                        </div>
                    )}

                    {message && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
                            <p>{message}</p>
                            {(action === 'transfer' || action === 'employee') && confirmDuplicate && (
                                <p className="mt-1 text-xs">
                                    {t('Renvoyez pour confirmer cette opération malgré tout.')}
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
                            (action === 'expense' && !label) ||
                            (action === 'employee' && !employeeId)
                        }
                    >
                        {mutation.isPending ? <Loader2 className="animate-spin" /> : <Banknote />}
                        {t('Valider')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
