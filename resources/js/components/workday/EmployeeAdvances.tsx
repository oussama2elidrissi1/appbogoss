import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Check, HandCoins, Loader2 } from 'lucide-react';
import { createAdvance, getAdvances, getErrorMessage, settleAdvance } from '@/lib/api';
import { workDayKeys } from '@/hooks/useWorkDay';
import { formatCurrency } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

interface EmployeeAdvancesProps {
    employee: Employee;
    /** Attaches the advance to the open day when there is one. */
    workDayId?: number;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Outstanding balance, history and the "donner une avance" inline form. */
export function EmployeeAdvances({ employee, workDayId }: EmployeeAdvancesProps) {
    const queryClient = useQueryClient();
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [givenOn, setGivenOn] = useState(today());

    const { data, isPending } = useQuery({
        queryKey: workDayKeys.advances(employee.id),
        queryFn: () => getAdvances(employee.id),
    });

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: workDayKeys.advances(employee.id) });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    const createMutation = useMutation({
        mutationFn: createAdvance,
        onSuccess: () => {
            invalidate();
            setAmount('');
            setReason('');
            setGivenOn(today());
        },
    });

    const settleMutation = useMutation({
        mutationFn: settleAdvance,
        onSuccess: invalidate,
    });

    const amountValue = Number.parseFloat(amount.replace(',', '.'));
    const canSubmit = Number.isFinite(amountValue) && amountValue > 0 && givenOn.length > 0;

    function submit() {
        if (!canSubmit) return;
        createMutation.mutate({
            employee_id: employee.id,
            amount: amountValue,
            given_on: givenOn,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
            ...(workDayId ? { work_day_id: workDayId } : {}),
        });
    }

    const advances = data?.data ?? [];

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
        >
            <Separator className="my-4" />

            <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <HandCoins className="h-4 w-4" />
                    Avances en cours
                </span>
                {isPending ? (
                    <Skeleton className="h-5 w-20" />
                ) : (
                    <span className="text-sm font-semibold tabular-nums text-accent">
                        {formatCurrency(data?.outstanding_total ?? 0, { maximumFractionDigits: 2 })}
                    </span>
                )}
            </div>

            {isPending ? (
                <div className="mt-3 space-y-2">
                    {Array.from({ length: 2 }).map((_, index) => (
                        <Skeleton key={index} className="h-10 w-full rounded-md" />
                    ))}
                </div>
            ) : advances.length === 0 ? (
                <p className="mt-3 rounded-md border border-dashed border-white/[0.08] px-3 py-3 text-center text-xs text-muted-foreground">
                    Aucune avance enregistrée.
                </p>
            ) : (
                <ul className="mt-3 max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
                    {advances.map((advance) => (
                        <li
                            key={advance.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium tabular-nums text-foreground">
                                    {formatCurrency(advance.amount, { maximumFractionDigits: 2 })}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {advance.given_on}
                                    {advance.reason ? ` · ${advance.reason}` : ''}
                                </p>
                            </div>

                            {advance.settled_at ? (
                                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success">
                                    <Check className="h-3.5 w-3.5" />
                                    Réglée
                                </span>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="shrink-0"
                                    disabled={settleMutation.isPending}
                                    onClick={() => settleMutation.mutate(advance.id)}
                                >
                                    Solder
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-4 space-y-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-3.5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Donner une avance
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                        <Label htmlFor={`advance-amount-${employee.id}`} className="text-xs">
                            Montant
                        </Label>
                        <Input
                            id={`advance-amount-${employee.id}`}
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder="0,00"
                            className="h-9 tabular-nums"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`advance-date-${employee.id}`} className="text-xs">
                            Date
                        </Label>
                        <Input
                            id={`advance-date-${employee.id}`}
                            type="date"
                            value={givenOn}
                            onChange={(event) => setGivenOn(event.target.value)}
                            className="h-9"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor={`advance-reason-${employee.id}`} className="text-xs">
                        Motif <span className="font-normal">(optionnel)</span>
                    </Label>
                    <Input
                        id={`advance-reason-${employee.id}`}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Ex. dépannage personnel"
                        className="h-9"
                    />
                </div>

                {createMutation.isError && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3 py-2">
                        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
                        <p className="text-xs text-destructive">
                            {getErrorMessage(createMutation.error)}
                        </p>
                    </div>
                )}

                <Button
                    variant="accent"
                    size="sm"
                    className="w-full"
                    disabled={!canSubmit || createMutation.isPending}
                    onClick={submit}
                >
                    {createMutation.isPending && <Loader2 className="animate-spin" />}
                    Enregistrer l’avance
                </Button>
            </div>
        </motion.div>
    );
}
