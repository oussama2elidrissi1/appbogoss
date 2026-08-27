import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertCircle,
    Box,
    CalendarClock,
    Coffee,
    HandCoins,
    History,
    Loader2,
    MoreHorizontal,
    Package,
    Receipt,
    ShoppingBasket,
    Trash2,
    Wrench,
    type LucideIcon,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import {
    convertExpenseToAdvance,
    createExpense,
    deleteExpense,
    getEmployees,
    getErrorMessage,
    getExpenses,
    getWorkDays,
    updateExpense,
} from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkDay, useRefreshDay, workDayKeys } from '@/hooks/useWorkDay';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Expense } from '@/types/workday';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/dashboard/EmptyState';

interface ExpenseCategory {
    value: string;
    label: string;
    icon: LucideIcon;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
    { value: 'achats', label: 'Achats', icon: ShoppingBasket },
    { value: 'produits', label: 'Produits', icon: Package },
    { value: 'reparations', label: 'Réparations', icon: Wrench },
    { value: 'boissons', label: 'Boissons', icon: Coffee },
    { value: 'divers', label: 'Divers', icon: Box },
    { value: 'autre', label: 'Autre', icon: MoreHorizontal },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
    EXPENSE_CATEGORIES.map((category) => [category.value, category.label]),
);

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

type HistoryRange = 'week' | 'month' | 'all';

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function toISODate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function historyRangeFor(range: HistoryRange): { from: string; to: string } {
    const now = new Date();
    if (range === 'week') {
        const start = new Date(now);
        const day = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - day);
        return { from: toISODate(start), to: toISODate(now) };
    }
    if (range === 'all') return { from: '2020-01-01', to: toISODate(now) };
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISODate(start), to: toISODate(now) };
}

const schema = z.object({
    label: z.string().trim().min(1, 'Indiquez un libellé.').max(120, 'Libellé trop long.'),
    category: z.string().min(1, 'Choisissez une catégorie.'),
    amount: z
        .number({ invalid_type_error: 'Indiquez un montant.' })
        .positive('Le montant doit être supérieur à 0.'),
    spent_on: z.string().min(1, 'Indiquez une date.'),
});

type FormValues = z.infer<typeof schema>;

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
};

/** "No day open" notice — dépenses are always attached to a work day. */
function NoDayNotice() {
    const { t } = useI18n();
    return (
        <div className="flex min-h-[70vh] items-center justify-center">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                className="w-full max-w-md"
            >
                <Card className="relative overflow-hidden p-10 text-center">
                    <span className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-accent/[0.10] blur-3xl" />

                    <div className="relative flex justify-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-accent/[0.12] ring-1 ring-accent/20">
                            <Receipt className="h-6 w-6 text-accent" />
                        </span>
                    </div>

                    <h2 className="relative mt-5 text-xl font-semibold tracking-tight">
                        {t('Aucune journée ouverte')}
                    </h2>
                    <p className="relative mt-2.5 text-sm leading-relaxed text-muted-foreground">
                        {t('Ouvrez la journée dans Caisse pour enregistrer des dépenses.')}
                    </p>

                    <Button asChild variant="accent" className="relative mt-8">
                        <Link to="/pos">{t('Aller à la caisse')}</Link>
                    </Button>
                </Card>
            </motion.div>
        </div>
    );
}

export default function Depenses() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const refreshDay = useRefreshDay();
    const { hasRole } = useAuth();
    // Moving/converting/deleting an expense rewrites a caisse day's net
    // result after the fact — Super Admin only (enforced server-side too).
    const isSuperAdmin = hasRole('super-admin');
    const [justSaved, setJustSaved] = useState(false);
    const [convertingExpense, setConvertingExpense] = useState<Expense | null>(null);
    const [convertEmployeeId, setConvertEmployeeId] = useState('');
    const [movingExpense, setMovingExpense] = useState<Expense | null>(null);
    const [moveWorkDayId, setMoveWorkDayId] = useState('');
    const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
    const [newExpenseWorkDayId, setNewExpenseWorkDayId] = useState('');
    const [historyRange, setHistoryRange] = useState<HistoryRange>('month');

    const { data: workDay, isPending: dayPending } = useActiveWorkDay();

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { label: '', category: 'achats', amount: 0, spent_on: today() },
    });

    const category = watch('category');

    const { data: expenses, isPending: expensesPending } = useQuery({
        queryKey: workDayKeys.expenses(workDay?.id ?? null),
        queryFn: () => getExpenses({ workDayId: workDay?.id }),
        enabled: Boolean(workDay),
    });

    const historyDates = useMemo(() => historyRangeFor(historyRange), [historyRange]);
    const { data: historyExpenses, isPending: historyPending } = useQuery({
        queryKey: workDayKeys.expensesHistory(historyDates.from, historyDates.to),
        queryFn: () => getExpenses({ from: historyDates.from, to: historyDates.to }),
    });

    const mutation = useMutation({
        mutationFn: createExpense,
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: workDayKeys.expenses(workDay?.id ?? null),
            });
            void queryClient.invalidateQueries({ queryKey: ['expenses-history'] });
            refreshDay();
            reset({ label: '', category, amount: 0, spent_on: today() });
            setNewExpenseWorkDayId('');
            setJustSaved(true);
            window.setTimeout(() => setJustSaved(false), 1400);
        },
    });

    const { data: employees } = useQuery({
        queryKey: workDayKeys.employees,
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
    });

    // Every recent caisse day, so a backdated expense can be attributed to the
    // day it actually happened instead of always landing on today's — either
    // up front when creating it, or after the fact to fix one already wrong.
    const { data: workDays } = useQuery({
        queryKey: ['work-days', 'picker'],
        queryFn: getWorkDays,
        staleTime: 60_000,
    });

    const convertMutation = useMutation({
        mutationFn: ({ expenseId, employeeId }: { expenseId: number; employeeId: number }) =>
            convertExpenseToAdvance(expenseId, employeeId),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: workDayKeys.expenses(workDay?.id ?? null),
            });
            void queryClient.invalidateQueries({ queryKey: ['expenses-history'] });
            refreshDay();
            setConvertingExpense(null);
            setConvertEmployeeId('');
        },
    });

    const moveMutation = useMutation({
        mutationFn: ({ expenseId, workDayId }: { expenseId: number; workDayId: number }) =>
            updateExpense(expenseId, { work_day_id: workDayId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: workDayKeys.expenses(workDay?.id ?? null),
            });
            void queryClient.invalidateQueries({ queryKey: ['expenses-history'] });
            refreshDay();
            setMovingExpense(null);
            setMoveWorkDayId('');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (expenseId: number) => deleteExpense(expenseId),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: workDayKeys.expenses(workDay?.id ?? null),
            });
            void queryClient.invalidateQueries({ queryKey: ['expenses-history'] });
            refreshDay();
            setDeletingExpense(null);
        },
    });

    if (dayPending) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-52" />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Skeleton className="h-96 w-full rounded-lg" />
                    <Skeleton className="h-96 w-full rounded-lg" />
                </div>
            </div>
        );
    }

    if (!workDay) return <NoDayNotice />;

    const onSubmit = handleSubmit((values) => {
        mutation.mutate({
            label: values.label.trim(),
            category: values.category,
            amount: values.amount,
            spent_on: values.spent_on,
            work_day_id: newExpenseWorkDayId ? Number(newExpenseWorkDayId) : workDay.id,
        });
    });

    const total = (expenses ?? []).reduce((sum, expense) => sum + expense.amount, 0);

    const renderExpenseItem = (expense: Expense) => {
        const isConverting = convertingExpense?.id === expense.id;
        const isMoving = movingExpense?.id === expense.id;

        return (
            <motion.li
                key={expense.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={cn(
                    'rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-2.5 transition-colors duration-200',
                    !isConverting && !isMoving && 'hover:border-destructive/20',
                    (isConverting || isMoving) && 'border-accent/25 bg-accent/[0.05]',
                )}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{expense.label}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {t(CATEGORY_LABELS[expense.category] ?? expense.category)}
                            {' · '}
                            {expense.spent_on}
                            {expense.work_day_date && expense.work_day_date !== expense.spent_on
                                ? ` · ${t('caisse du')} ${formatDate(expense.work_day_date)}`
                                : ''}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {isSuperAdmin && (
                            <>
                                <button
                                    type="button"
                                    title={t('Déplacer vers une autre journée de caisse')}
                                    aria-label={t('Déplacer vers une autre journée de caisse')}
                                    onClick={() => {
                                        if (isMoving) {
                                            setMovingExpense(null);
                                        } else {
                                            setMovingExpense(expense);
                                            setMoveWorkDayId('');
                                            setConvertingExpense(null);
                                        }
                                    }}
                                    className={cn(
                                        'rounded-sm p-1 text-muted-foreground transition-colors hover:text-accent',
                                        isMoving && 'text-accent',
                                    )}
                                >
                                    <CalendarClock className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    title={t('Convertir en avance sur salaire')}
                                    aria-label={t('Convertir en avance sur salaire')}
                                    onClick={() => {
                                        if (isConverting) {
                                            setConvertingExpense(null);
                                        } else {
                                            setConvertingExpense(expense);
                                            setConvertEmployeeId('');
                                            setMovingExpense(null);
                                        }
                                    }}
                                    className={cn(
                                        'rounded-sm p-1 text-muted-foreground transition-colors hover:text-accent',
                                        isConverting && 'text-accent',
                                    )}
                                >
                                    <HandCoins className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    title={t('Supprimer cette dépense')}
                                    aria-label={t('Supprimer cette dépense')}
                                    onClick={() => {
                                        setDeletingExpense(expense);
                                        setMovingExpense(null);
                                        setConvertingExpense(null);
                                    }}
                                    className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-destructive"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </>
                        )}
                        <span className="text-sm font-semibold tabular-nums text-destructive">
                            −{formatCurrency(expense.amount, { maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {isMoving && (
                    <div className="mt-2.5 space-y-2 border-t border-tint/[0.06] pt-2.5">
                        <p className="text-xs text-muted-foreground">
                            {t('Rattacher cette dépense à la journée de caisse du :')}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={moveWorkDayId} onValueChange={setMoveWorkDayId}>
                                <SelectTrigger className="h-8 flex-1">
                                    <SelectValue placeholder={t('Choisir une journée…')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(workDays ?? []).map((day) => (
                                        <SelectItem key={day.id} value={String(day.id)}>
                                            {formatDate(day.date)}
                                            {day.status === 'open' ? ` ${t('(ouverte)')}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                type="button"
                                variant="accent"
                                size="sm"
                                disabled={!moveWorkDayId || moveMutation.isPending}
                                onClick={() =>
                                    moveMutation.mutate({
                                        expenseId: expense.id,
                                        workDayId: Number(moveWorkDayId),
                                    })
                                }
                            >
                                {moveMutation.isPending && <Loader2 className="animate-spin" />}
                                {t('Déplacer')}
                            </Button>
                        </div>
                        {moveMutation.isError && (
                            <p className="text-xs text-destructive">{getErrorMessage(moveMutation.error)}</p>
                        )}
                    </div>
                )}

                {isConverting && (
                    <div className="mt-2.5 space-y-2 border-t border-tint/[0.06] pt-2.5">
                        <p className="text-xs text-muted-foreground">{t('En réalité une avance sur salaire pour :')}</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={convertEmployeeId} onValueChange={setConvertEmployeeId}>
                                <SelectTrigger className="h-8 flex-1">
                                    <SelectValue placeholder={t('Choisir un employé…')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(employees ?? []).map((option) => (
                                        <SelectItem key={option.id} value={String(option.id)}>
                                            {option.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                type="button"
                                variant="accent"
                                size="sm"
                                disabled={!convertEmployeeId || convertMutation.isPending}
                                onClick={() =>
                                    convertMutation.mutate({
                                        expenseId: expense.id,
                                        employeeId: Number(convertEmployeeId),
                                    })
                                }
                            >
                                {convertMutation.isPending && <Loader2 className="animate-spin" />}
                                {t('Convertir')}
                            </Button>
                        </div>
                        {convertMutation.isError && (
                            <p className="text-xs text-destructive">{getErrorMessage(convertMutation.error)}</p>
                        )}
                    </div>
                )}
            </motion.li>
        );
    };

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            <motion.div variants={item}>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Dépenses du jour')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Chaque sortie de caisse est rattachée à la journée en cours et déduite du résultat net.')}
                </p>
            </motion.div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <motion.div variants={item}>
                    <Card className="relative overflow-hidden">
                        <AnimatePresence>
                            {justSaved && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-success"
                                />
                            )}
                        </AnimatePresence>

                        <CardHeader>
                            <CardTitle>{t('Nouvelle dépense')}</CardTitle>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                {t('Libellé, catégorie et montant — trois champs, c’est tout.')}
                            </p>
                        </CardHeader>

                        <CardContent>
                            <form onSubmit={onSubmit} className="space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="expense-label">{t('Libellé')}</Label>
                                    <Input
                                        id="expense-label"
                                        placeholder={t('Ex. Serviettes, recharge gaz…')}
                                        {...register('label')}
                                    />
                                    {errors.label && (
                                        <p className="text-xs text-destructive">
                                            {t(errors.label.message ?? '')}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2.5">
                                    <Label>{t('Catégorie')}</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {EXPENSE_CATEGORIES.map((option) => {
                                            const Icon = option.icon;
                                            return (
                                                <Chip
                                                    key={option.value}
                                                    size="lg"
                                                    selected={category === option.value}
                                                    onClick={() =>
                                                        setValue('category', option.value, {
                                                            shouldValidate: true,
                                                        })
                                                    }
                                                >
                                                    <Icon
                                                        className={cn(
                                                            category === option.value
                                                                ? 'text-accent'
                                                                : 'text-muted-foreground',
                                                        )}
                                                    />
                                                    <span className="text-xs">{t(option.label)}</span>
                                                </Chip>
                                            );
                                        })}
                                    </div>
                                    {errors.category && (
                                        <p className="text-xs text-destructive">
                                            {t(errors.category.message ?? '')}
                                        </p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="expense-amount">{t('Montant')}</Label>
                                        <Input
                                            id="expense-amount"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            inputMode="decimal"
                                            placeholder="0,00"
                                            className="text-lg font-semibold tabular-nums"
                                            {...register('amount', { valueAsNumber: true })}
                                        />
                                        {errors.amount && (
                                            <p className="text-xs text-destructive">
                                                {t(errors.amount.message ?? '')}
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="expense-date">{t('Date')}</Label>
                                        <Input
                                            id="expense-date"
                                            type="date"
                                            {...register('spent_on')}
                                        />
                                        {errors.spent_on && (
                                            <p className="text-xs text-destructive">
                                                {t(errors.spent_on.message ?? '')}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>
                                        {t('Journée de caisse')} <span className="font-normal">{t('(optionnel)')}</span>
                                    </Label>
                                    <Select value={newExpenseWorkDayId} onValueChange={setNewExpenseWorkDayId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('Journée ouverte aujourd’hui')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(workDays ?? []).map((day) => (
                                                <SelectItem key={day.id} value={String(day.id)}>
                                                    {formatDate(day.date)}
                                                    {day.status === 'open' ? ` ${t('(ouverte)')}` : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-muted-foreground">
                                        {t('Pour une dépense d’une journée déjà clôturée — sinon elle est automatiquement rattachée à la journée en cours, quelle que soit la date choisie ci-dessus.')}
                                    </p>
                                </div>

                                {mutation.isError && (
                                    <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                                        <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                                        <p className="text-sm text-destructive">
                                            {getErrorMessage(mutation.error)}
                                        </p>
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    variant="accent"
                                    size="lg"
                                    className="w-full"
                                    disabled={mutation.isPending}
                                >
                                    {mutation.isPending && <Loader2 className="animate-spin" />}
                                    {mutation.isPending
                                        ? t('Enregistrement…')
                                        : t('Enregistrer la dépense')}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={item}>
                    <Card className="h-full">
                        <CardHeader>
                            <div className="flex items-baseline justify-between gap-3">
                                <CardTitle>{t('Dépenses enregistrées')}</CardTitle>
                                {(expenses?.length ?? 0) > 0 && (
                                    <span className="text-sm font-semibold tabular-nums text-destructive">
                                        {formatCurrency(total, { maximumFractionDigits: 2 })}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                {t('Total cumulé sur la journée en cours')}
                            </p>
                        </CardHeader>

                        <CardContent>
                            {expensesPending ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 5 }).map((_, index) => (
                                        <Skeleton key={index} className="h-14 w-full rounded-md" />
                                    ))}
                                </div>
                            ) : (expenses ?? []).length === 0 ? (
                                <EmptyState
                                    icon={Receipt}
                                    title={t('Aucune dépense')}
                                    description={t('Les sorties de caisse de la journée apparaîtront ici.')}
                                />
                            ) : (
                                <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-0.5">
                                    <AnimatePresence initial={false}>
                                        {(expenses ?? []).map(renderExpenseItem)}
                                    </AnimatePresence>
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            <motion.div variants={item}>
                <Card>
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <History className="h-4 w-4 text-muted-foreground" />
                                <CardTitle>{t('Historique des dépenses')}</CardTitle>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(['week', 'month', 'all'] as HistoryRange[]).map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setHistoryRange(option)}
                                        className={cn(
                                            'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200',
                                            historyRange === option
                                                ? 'border-accent/60 bg-accent/[0.12] text-foreground'
                                                : 'border-tint/[0.08] text-muted-foreground hover:border-accent/30',
                                        )}
                                    >
                                        {option === 'week' ? t('Cette semaine') : option === 'month' ? t('Ce mois') : t('Tout')}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {t('Toutes les dépenses de la période, quelle que soit leur journée de caisse — de quoi retrouver et corriger une dépense passée.')}
                        </p>
                    </CardHeader>

                    <CardContent>
                        {historyPending ? (
                            <div className="space-y-3">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <Skeleton key={index} className="h-14 w-full rounded-md" />
                                ))}
                            </div>
                        ) : (historyExpenses ?? []).length === 0 ? (
                            <EmptyState
                                icon={History}
                                title={t('Aucune dépense sur cette période')}
                                description={t('Élargissez la période pour retrouver une dépense passée.')}
                            />
                        ) : (
                            <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-0.5">
                                <AnimatePresence initial={false}>
                                    {(historyExpenses ?? []).map(renderExpenseItem)}
                                </AnimatePresence>
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            <ConfirmDialog
                open={deletingExpense !== null}
                onOpenChange={(open) => {
                    if (!open) setDeletingExpense(null);
                }}
                title={t('Supprimer cette dépense ?')}
                description={
                    deletingExpense
                        ? t('« {label} » (−{amount}) sera définitivement supprimée — le résultat de sa journée de caisse sera recalculé sans elle.', {
                              label: deletingExpense.label,
                              amount: formatCurrency(deletingExpense.amount, { maximumFractionDigits: 2 }),
                          })
                        : undefined
                }
                confirmLabel={t('Supprimer')}
                loading={deleteMutation.isPending}
                onConfirm={() => deletingExpense && deleteMutation.mutate(deletingExpense.id)}
            />
        </motion.div>
    );
}

