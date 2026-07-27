import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertCircle,
    Box,
    Coffee,
    Loader2,
    MoreHorizontal,
    Package,
    Receipt,
    ShoppingBasket,
    Wrench,
    type LucideIcon,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { createExpense, getErrorMessage, getExpenses } from '@/lib/api';
import { useActiveWorkDay, useRefreshDay, workDayKeys } from '@/hooks/useWorkDay';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
                        Aucune journée ouverte
                    </h2>
                    <p className="relative mt-2.5 text-sm leading-relaxed text-muted-foreground">
                        Ouvrez la journée dans Caisse pour enregistrer des dépenses.
                    </p>

                    <Button asChild variant="accent" className="relative mt-8">
                        <Link to="/pos">Aller à la caisse</Link>
                    </Button>
                </Card>
            </motion.div>
        </div>
    );
}

export default function Depenses() {
    const queryClient = useQueryClient();
    const refreshDay = useRefreshDay();
    const [justSaved, setJustSaved] = useState(false);

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
        queryFn: () => getExpenses(workDay?.id),
        enabled: Boolean(workDay),
    });

    const mutation = useMutation({
        mutationFn: createExpense,
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: workDayKeys.expenses(workDay?.id ?? null),
            });
            refreshDay();
            reset({ label: '', category, amount: 0, spent_on: today() });
            setJustSaved(true);
            window.setTimeout(() => setJustSaved(false), 1400);
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
            work_day_id: workDay.id,
        });
    });

    const total = (expenses ?? []).reduce((sum, expense) => sum + expense.amount, 0);

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            <motion.div variants={item}>
                <h2 className="text-2xl font-semibold tracking-tight">Dépenses du jour</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Chaque sortie de caisse est rattachée à la journée en cours et déduite du
                    résultat net.
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
                            <CardTitle>Nouvelle dépense</CardTitle>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                Libellé, catégorie et montant — trois champs, c’est tout.
                            </p>
                        </CardHeader>

                        <CardContent>
                            <form onSubmit={onSubmit} className="space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="expense-label">Libellé</Label>
                                    <Input
                                        id="expense-label"
                                        placeholder="Ex. Serviettes, recharge gaz…"
                                        {...register('label')}
                                    />
                                    {errors.label && (
                                        <p className="text-xs text-destructive">
                                            {errors.label.message}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2.5">
                                    <Label>Catégorie</Label>
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
                                                    <span className="text-xs">{option.label}</span>
                                                </Chip>
                                            );
                                        })}
                                    </div>
                                    {errors.category && (
                                        <p className="text-xs text-destructive">
                                            {errors.category.message}
                                        </p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="expense-amount">Montant</Label>
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
                                                {errors.amount.message}
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="expense-date">Date</Label>
                                        <Input
                                            id="expense-date"
                                            type="date"
                                            {...register('spent_on')}
                                        />
                                        {errors.spent_on && (
                                            <p className="text-xs text-destructive">
                                                {errors.spent_on.message}
                                            </p>
                                        )}
                                    </div>
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
                                        ? 'Enregistrement…'
                                        : 'Enregistrer la dépense'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={item}>
                    <Card className="h-full">
                        <CardHeader>
                            <div className="flex items-baseline justify-between gap-3">
                                <CardTitle>Dépenses enregistrées</CardTitle>
                                {(expenses?.length ?? 0) > 0 && (
                                    <span className="text-sm font-semibold tabular-nums text-destructive">
                                        {formatCurrency(total, { maximumFractionDigits: 2 })}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                Total cumulé sur la journée en cours
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
                                    title="Aucune dépense"
                                    description="Les sorties de caisse de la journée apparaîtront ici."
                                />
                            ) : (
                                <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-0.5">
                                    <AnimatePresence initial={false}>
                                        {(expenses ?? []).map((expense) => (
                                            <motion.li
                                                key={expense.id}
                                                layout
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.25 }}
                                                className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 transition-colors duration-200 hover:border-destructive/20"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-foreground">
                                                        {expense.label}
                                                    </p>
                                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                        {CATEGORY_LABELS[expense.category] ??
                                                            expense.category}
                                                        {' · '}
                                                        {expense.spent_on}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 text-sm font-semibold tabular-nums text-destructive">
                                                    −
                                                    {formatCurrency(expense.amount, {
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </span>
                                            </motion.li>
                                        ))}
                                    </AnimatePresence>
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </motion.div>
    );
}
