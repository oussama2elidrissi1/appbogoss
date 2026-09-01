import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
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
    getEmployeeDues,
    getEmployeePaymentContext,
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
    EmployeeDueRow,
    EmployeeDues,
    EmployeePaymentContext,
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
import { PaymentSourceNotice } from '@/components/workday/PaymentSourceNotice';

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

/** Ce qu'un clic sur « Payer » d'une ligne pose dans la modale. */
interface PaymentPrefill {
    employeeId: string;
    period: string;
    amount: string;
    kind: EmployeePaymentKind;
    /**
     * Le reste dépassait le solde disponible : le montant proposé a été
     * ramené à ce que le portefeuille peut réellement payer. Le dire évite
     * une saisie qui ne pouvait que se faire refuser.
     */
    capped: boolean;
}

/** « 2026-09 » — le mois courant, format attendu par l'API et par `<input type="month">`. */
const currentPeriod = new Date().toISOString().slice(0, 7);

/**
 * Ce que chaque geste fait a l'argent, dit en une phrase.
 *
 * Toutes ces operations sortent du PORTEFEUILLE : aucune ne touche la caisse
 * du jour, et chaque texte le rappelle explicitement. C'est la confusion que
 * ce module existe pour supprimer.
 */
const SOURCE_DETAIL: Record<WalletActionKind, string> = {
    transfer:
        "Le montant quitte votre portefeuille pour celui du patron. La caisse du jour n'est pas touchee.",
    employee:
        'Ce paiement sera debite uniquement de votre portefeuille. Il ne modifiera ni le resultat de caisse, ni la journee ouverte.',
    expense:
        "Cette depense sera debitee uniquement de votre portefeuille. Elle n'entre pas dans les depenses de la caisse.",
    fund: "L'argent reste chez vous : il passe du disponible au fond de caisse. La caisse du jour n'est pas touchee.",
    'fund-return':
        "Le montant repasse du fond de caisse vers votre disponible. La caisse du jour n'est pas touchee.",
};

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
    const [duesPeriod, setDuesPeriod] = useState(currentPeriod);
    // Ce que « Payer » d'une ligne pose dans la modale : l'employe, le mois et
    // le reste. L'admin n'a plus qu'a confirmer.
    const [prefill, setPrefill] = useState<PaymentPrefill | null>(null);

    const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWallet });
    const duesQuery = useQuery({
        queryKey: ['employee-dues', duesPeriod],
        queryFn: () => getEmployeeDues(duesPeriod),
    });
    const historyQuery = useQuery({
        queryKey: ['wallet', 'transactions', filters],
        queryFn: () => getWalletTransactions(filters),
    });

    const wallet = walletQuery.data;

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['wallet'] });
        void queryClient.invalidateQueries({ queryKey: ['employee-dues'] });
        void queryClient.invalidateQueries({ queryKey: ['employee-payment-context'] });
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

                    <EmployeeDuesSection
                        period={duesPeriod}
                        onPeriodChange={setDuesPeriod}
                        dues={duesQuery.data}
                        isPending={duesQuery.isPending}
                        isError={duesQuery.isError}
                        error={duesQuery.error}
                        onPay={(row) => {
                            // Proposer le reste entier quand le portefeuille ne
                            // peut pas le couvrir, c'est proposer un refus. On
                            // propose ce qui est payable, et le champ reste
                            // librement modifiable.
                            const payable =
                                Math.round(
                                    Math.min(row.remaining, wallet?.balance ?? 0) * 100,
                                ) / 100;

                            setPrefill({
                                employeeId: String(row.employee_id),
                                period: duesPeriod,
                                amount: payable > 0 ? String(payable) : '',
                                kind: 'commission',
                                capped: payable > 0 && payable < row.remaining,
                            });
                            setAction('employee');
                        }}
                    />

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
                prefill={prefill}
                dues={duesQuery.data?.employees ?? []}
                onClose={() => {
                    setAction(null);
                    setPrefill(null);
                }}
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
                    {transaction.employee_id !== null && transaction.employee_name && (
                        <Link
                            to={`/employees/${transaction.employee_id}`}
                            className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                        >
                            {transaction.employee_name}
                        </Link>
                    )}
                    {transaction.category_label && (
                        <Badge variant="outline">{transaction.category_label}</Badge>
                    )}
                    {transaction.period && <Badge variant="outline">{transaction.period}</Badge>}
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
                    {' · '}
                    {/* La source, sur chaque ligne : cet argent-la est sorti du
                        portefeuille, jamais du tiroir. */}
                    {t('Source : Portefeuille Admin')}
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
    prefill,
    dues,
    onClose,
    onDone,
}: {
    action: WalletActionKind | null;
    balance: number;
    prefill: PaymentPrefill | null;
    dues: EmployeeDueRow[];
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

    // Du / deja verse / reste, relu a chaque changement d'employe, de motif ou
    // de periode : c'est ce qui rend un doublon visible AVANT la validation.
    const contextQuery = useQuery({
        queryKey: ['employee-payment-context', employeeId, kind, period],
        queryFn: () =>
            getEmployeePaymentContext(Number(employeeId), {
                kind,
                period: period || undefined,
            }),
        enabled: action === 'employee' && employeeId !== '',
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

    // Ouverture depuis « Payer » d'une ligne : l'employe, le mois et le reste
    // sont deja poses. Ne depend que de `prefill`, pour ne pas ecraser une
    // saisie en cours a chaque re-rendu.
    useEffect(() => {
        if (prefill === null) return;
        setEmployeeId(prefill.employeeId);
        setPeriod(prefill.period);
        setAmount(prefill.amount);
        setKind(prefill.kind);
    }, [prefill]);

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
                    // Les deux avertissements du serveur sont levés ensemble au
                    // second envoi : l'utilisateur vient de lire le message
                    // exact, et le renvoi est déjà le geste de confirmation.
                    acknowledge_duplicate: confirmDuplicate || undefined,
                    acknowledge_over_due: confirmDuplicate || undefined,
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
                    {/* La premiere chose lue dans la modale : d'ou sort
                        l'argent. Le solde de caisse n'apparait nulle part
                        ici — ce n'est pas lui qui bouge. */}
                    <PaymentSourceNotice source="wallet" detail={SOURCE_DETAIL[action ?? 'transfer']} />

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
                        {action === 'employee' && prefill?.capped && (
                            <p className="text-xs text-muted-foreground">
                                {t('Montant ramené à votre solde disponible. Vous pourrez verser le reste plus tard.')}
                            </p>
                        )}
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
                                        {(employeesQuery.data ?? []).map((employee) => {
                                            const due = dues.find(
                                                (row) => row.employee_id === employee.id,
                                            );

                                            return (
                                                <SelectItem
                                                    key={employee.id}
                                                    value={String(employee.id)}
                                                >
                                                    {employee.name}
                                                    {due && due.remaining > 0 && (
                                                        <span className="ml-2 text-xs text-muted-foreground">
                                                            {t('reste')}{' '}
                                                            {formatCurrency(due.remaining, {
                                                                maximumFractionDigits: 2,
                                                            })}
                                                        </span>
                                                    )}
                                                </SelectItem>
                                            );
                                        })}
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

                    {action === 'employee' && contextQuery.data && (
                        <PaymentContextPanel
                            context={contextQuery.data}
                            amount={Number(amount)}
                        />
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

/**
 * Ce qui a déjà été versé sur cette période, et ce qu'il reste.
 *
 * Le montant dû n'existe que pour une commission : l'application ne connaît
 * aucun salaire de référence. Plutôt que d'afficher un chiffre inventé, elle
 * montre alors ce qui a déjà été versé — ce qui suffit à repérer un doublon,
 * qui est le vrai risque.
 */
function PaymentContextPanel({
    context,
    amount,
}: {
    context: EmployeePaymentContext;
    amount: number;
}) {
    const { t } = useI18n();
    const overDue =
        context.remaining !== null && amount > 0 && amount > context.remaining + 0.005;

    return (
        <div className="rounded-md border border-tint/[0.08] bg-tint/[0.02] p-3 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {context.period
                    ? t('Déjà enregistré pour {period}', { period: context.period })
                    : t('Déjà enregistré')}
            </p>

            {context.due_total !== null && (
                <Row
                    label={t(context.due_label ?? 'Montant dû')}
                    value={formatCurrency(context.due_total, { maximumFractionDigits: 2 })}
                />
            )}
            <Row
                label={t('Déjà payé')}
                value={formatCurrency(context.already_paid_total, { maximumFractionDigits: 2 })}
                hint={
                    context.already_paid_caisse > 0
                        ? t('dont {amount} sortis de la caisse', {
                              amount: formatCurrency(context.already_paid_caisse, {
                                  maximumFractionDigits: 2,
                              }),
                          })
                        : undefined
                }
            />
            {context.remaining !== null && (
                <Row
                    label={t('Reste à payer')}
                    value={formatCurrency(context.remaining, { maximumFractionDigits: 2 })}
                />
            )}

            {/* La projection : payer 2 000 sur 8 000 laisse 6 000. C'est le
                chiffre qu'on veut lire avant de valider, pas apres. */}
            {context.remaining !== null && amount > 0 && (
                <Row
                    label={t('Reste après ce paiement')}
                    value={formatCurrency(Math.max(0, context.remaining - amount), {
                        maximumFractionDigits: 2,
                    })}
                    strong
                />
            )}

            {context.due_total === null && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("Aucun montant de référence pour ce motif : le salon n'enregistre pas de salaire fixe. Vérifiez les versements ci-dessus avant de confirmer.")}
                </p>
            )}

            {overDue && (
                <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/[0.10] px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {t('Ce montant dépasse le reste à payer ({remaining}). Le serveur demandera une confirmation explicite.', {
                        remaining: formatCurrency(context.remaining ?? 0, {
                            maximumFractionDigits: 2,
                        }),
                    })}
                </p>
            )}

            {context.payments.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-tint/[0.08] pt-2">
                    {context.payments.map((payment) => (
                        <div
                            key={payment.id}
                            className="flex items-center justify-between gap-2 text-xs"
                        >
                            <span className="truncate text-muted-foreground">
                                {payment.kind_label}
                                {' · '}
                                {payment.source === 'wallet' ? t('Wallet') : t('Caisse')}
                            </span>
                            <span className="shrink-0 tabular-nums">
                                {formatCurrency(payment.amount, { maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Row({
    label,
    value,
    hint,
    strong = false,
}: {
    label: string;
    value: string;
    hint?: string;
    strong?: boolean;
}) {
    return (
        <div className={cn('mt-1 flex items-baseline justify-between gap-3', strong && 'font-semibold')}>
            <span className="text-muted-foreground">
                {label}
                {hint && <span className="ml-1 text-[11px]">({hint})</span>}
            </span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

/**
 * Qui reste à payer, pour le mois choisi.
 *
 * La liste répond à une question que personne ne devrait avoir à reconstituer
 * fiche par fiche : à qui dois-je encore de l'argent ce mois-ci. Elle est
 * triée par ce qui reste, et le bouton « Payer » ouvre la modale déjà remplie.
 *
 * « Dû » est la commission gagnée — la seule obligation que l'application
 * connaisse. « Versé » compte tout l'argent réellement remis pour ce mois,
 * portefeuille ET caisse : une avance en fait partie, puisqu'elle est déjà
 * dans la main de l'employé.
 */
function EmployeeDuesSection({
    period,
    onPeriodChange,
    dues,
    isPending,
    isError,
    error,
    onPay,
}: {
    period: string;
    onPeriodChange: (period: string) => void;
    dues: EmployeeDues | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    onPay: (row: EmployeeDueRow) => void;
}) {
    const { t } = useI18n();

    return (
        <Card>
            <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="mr-auto">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('Reste à payer aux employés')}
                        </h3>
                        {dues && (
                            <>
                                <p className="mt-1 text-sm">
                                    <span className="font-semibold tabular-nums">
                                        {formatCurrency(dues.totals.remaining_total, {
                                            maximumFractionDigits: 2,
                                        })}
                                    </span>{' '}
                                    <span className="text-muted-foreground">
                                        {t('restant pour {count} employé(s)', {
                                            count: String(dues.totals.employees_remaining),
                                        })}
                                    </span>
                                </p>
                                {dues.totals.advances_carried_over_total > 0 && (
                                    <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                                        {t("Les avances en cours incluent {amount} d'acomptes de mois précédents, toujours non soldés. La paie les déduit tant qu'ils ne le sont pas.", {
                                            amount: formatCurrency(
                                                dues.totals.advances_carried_over_total,
                                                { maximumFractionDigits: 2 },
                                            ),
                                        })}
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {t('Mois')}
                        </Label>
                        <Input
                            type="month"
                            className="w-40"
                            value={period}
                            onChange={(event) => onPeriodChange(event.target.value)}
                        />
                    </div>
                </div>

                {isPending && <Skeleton className="h-28 w-full" />}

                {isError && (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        {getErrorMessage(error)}
                    </p>
                )}

                {dues && dues.employees.length === 0 && (
                    <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        {t("Aucune commission gagnée ni versement enregistré sur ce mois.")}
                    </p>
                )}

                {dues && dues.employees.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                                    <th className="px-2 py-2 font-semibold">{t('Employé')}</th>
                                    <th className="px-2 py-2 text-right font-semibold">
                                        {t('Commission due')}
                                    </th>
                                    <th className="px-2 py-2 text-right font-semibold">
                                        {t('Versé')}
                                    </th>
                                    <th className="px-2 py-2 text-right font-semibold">
                                        {t('Avances en cours')}
                                    </th>
                                    <th className="px-2 py-2 text-right font-semibold">
                                        {t('Reste')}
                                    </th>
                                    <th className="px-2 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {dues.employees.map((row) => (
                                    <tr key={row.employee_id} className="border-t border-tint/[0.06]">
                                        <td className="px-2 py-2.5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-medium">
                                                    {row.employee_name}
                                                </span>
                                                {!row.is_active && (
                                                    <Badge variant="outline">{t('Inactif')}</Badge>
                                                )}

                                            </div>
                                        </td>
                                        <td className="px-2 py-2.5 text-right tabular-nums">
                                            {formatCurrency(row.due_total, {
                                                maximumFractionDigits: 2,
                                            })}
                                        </td>
                                        <td className="px-2 py-2.5 text-right tabular-nums">
                                            {formatCurrency(row.paid_total, {
                                                maximumFractionDigits: 2,
                                            })}
                                            {row.paid_payouts > 0 && (
                                                <span className="ml-1 text-[11px] text-muted-foreground">
                                                    ({t('dont paie')}{' '}
                                                    {formatCurrency(row.paid_payouts, {
                                                        maximumFractionDigits: 2,
                                                    })}
                                                    )
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                                            {formatCurrency(row.advances_outstanding, {
                                                maximumFractionDigits: 2,
                                            })}
                                            {/* Sans cette ligne, un montant
                                                apparait sur un mois ou aucune
                                                avance n'a ete donnee, et le
                                                chiffre parait faux alors qu'il
                                                est juste. */}
                                            {row.advances_carried_over > 0 && (
                                                <span className="block text-[11px]">
                                                    {t('dont {amount} de mois précédents', {
                                                        amount: formatCurrency(
                                                            row.advances_carried_over,
                                                            { maximumFractionDigits: 2 },
                                                        ),
                                                    })}
                                                </span>
                                            )}
                                        </td>
                                        <td
                                            className={cn(
                                                'px-2 py-2.5 text-right font-semibold tabular-nums',
                                                row.remaining > 0 && 'text-accent',
                                            )}
                                        >
                                            {formatCurrency(row.remaining, {
                                                maximumFractionDigits: 2,
                                            })}
                                        </td>
                                        <td className="px-2 py-2.5 text-right">
                                            {row.remaining > 0 && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onPay(row)}
                                                >
                                                    {t('Payer')}
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
