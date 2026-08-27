import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Sunrise, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { getEmployees, getErrorMessage, openWorkDay } from '@/lib/api';
import { useRefreshDay, workDayKeys } from '@/hooks/useWorkDay';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmployeeAvatar } from './EmployeeAvatar';

// Messages de validation en français (clés du dictionnaire) — traduits à l'affichage via t().
const schema = z.object({
    opening_balance: z
        .number({ invalid_type_error: 'Indiquez un montant.' })
        .min(0, 'Le solde ne peut pas être négatif.'),
    notes: z.string().max(500, 'Note trop longue.').optional(),
    employee_ids: z.array(z.number()).min(1, 'Sélectionnez au moins un employé présent.'),
});

type FormValues = z.infer<typeof schema>;

/**
 * The "no day open" state of the Caisse — a single focused card that opens the
 * work day. Every other screen in this module is gated behind it.
 */
export function OpenDayCard() {
    const { t } = useI18n();
    const refreshDay = useRefreshDay();

    const { data: employees, isPending: employeesPending } = useQuery({
        queryKey: workDayKeys.employees,
        queryFn: () => getEmployees(),
    });

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { opening_balance: 0, notes: '', employee_ids: [] },
    });

    const selectedIds = watch('employee_ids');

    // Everyone active is presumed present — staff untick the exceptions.
    useEffect(() => {
        if (!employees) return;
        setValue(
            'employee_ids',
            employees.filter((employee) => employee.is_active).map((employee) => employee.id),
            { shouldValidate: false },
        );
    }, [employees, setValue]);

    const mutation = useMutation({
        mutationFn: openWorkDay,
        onSuccess: () => refreshDay(),
    });

    function toggleEmployee(id: number) {
        const next = selectedIds.includes(id)
            ? selectedIds.filter((current) => current !== id)
            : [...selectedIds, id];
        setValue('employee_ids', next, { shouldValidate: true });
    }

    const onSubmit = handleSubmit((values) => {
        mutation.mutate({
            opening_balance: values.opening_balance,
            employee_ids: values.employee_ids,
            ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
        });
    });

    return (
        <div className="flex min-h-[70vh] items-center justify-center">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                className="w-full max-w-xl"
            >
                <Card className="relative overflow-hidden p-8">
                    {/* Soft accent bloom, same signature as the placeholder screens */}
                    <span className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-accent/[0.10] blur-3xl" />

                    <div className="relative flex flex-col items-center text-center">
                        <span className="relative flex h-14 w-14 items-center justify-center rounded-lg bg-accent/[0.12] ring-1 ring-accent/20">
                            <Sunrise className="h-6 w-6 text-accent" />
                            <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-lg ring-1 ring-accent/30"
                                animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.24, 1] }}
                                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        </span>

                        <h2 className="mt-5 text-xl font-semibold tracking-tight">
                            {t('Ouvrir la journée')}
                        </h2>
                        <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
                            {t('Renseignez le fond de caisse et l’équipe présente pour démarrer les encaissements.')}
                        </p>
                    </div>

                    <form onSubmit={onSubmit} className="relative mt-8 space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="opening_balance">{t('Solde initial')}</Label>
                            <Input
                                id="opening_balance"
                                type="number"
                                step="0.01"
                                min="0"
                                inputMode="decimal"
                                placeholder="0,00"
                                autoFocus
                                className="text-lg font-semibold tabular-nums"
                                {...register('opening_balance', { valueAsNumber: true })}
                            />
                            {errors.opening_balance && (
                                <p className="text-xs text-destructive">
                                    {t(errors.opening_balance.message ?? '')}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <Label>{t('Employés présents')}</Label>
                                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Users className="h-3.5 w-3.5" />
                                    {selectedIds.length} {t(selectedIds.length > 1 ? 'sélectionnés' : 'sélectionné')}
                                </span>
                            </div>

                            {employeesPending ? (
                                <div className="flex flex-wrap gap-2">
                                    {Array.from({ length: 4 }).map((_, index) => (
                                        <Skeleton key={index} className="h-11 w-36 rounded-md" />
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {(employees ?? [])
                                        .filter((employee) => employee.is_active)
                                        .map((employee) => (
                                            <Chip
                                                key={employee.id}
                                                selected={selectedIds.includes(employee.id)}
                                                onClick={() => toggleEmployee(employee.id)}
                                                className="pl-1.5"
                                            >
                                                <EmployeeAvatar
                                                    name={employee.name}
                                                    color={employee.avatar_color}
                                                    size="sm"
                                                />
                                                {employee.name}
                                            </Chip>
                                        ))}
                                </div>
                            )}

                            {errors.employee_ids && (
                                <p className="text-xs text-destructive">
                                    {t(errors.employee_ids.message ?? '')}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">
                                {t('Notes')} <span className="font-normal">{t('(optionnel)')}</span>
                            </Label>
                            <Input
                                id="notes"
                                placeholder={t('Remarque sur la journée…')}
                                {...register('notes')}
                            />
                            {errors.notes && (
                                <p className="text-xs text-destructive">{t(errors.notes.message ?? '')}</p>
                            )}
                        </div>

                        {mutation.isError && (
                            <div
                                className={cn(
                                    'flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3',
                                )}
                            >
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
                            {mutation.isPending ? t('Ouverture…') : t('Ouvrir la journée')}
                        </Button>
                    </form>
                </Card>
            </motion.div>
        </div>
    );
}
