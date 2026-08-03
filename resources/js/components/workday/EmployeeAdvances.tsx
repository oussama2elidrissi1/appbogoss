import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Check, HandCoins, Loader2, Pencil, Trash2, X } from 'lucide-react';
import {
    createAdvance,
    deleteAdvance,
    getAdvances,
    getErrorMessage,
    settleAdvance,
    updateAdvance,
} from '@/lib/api';
import { workDayKeys } from '@/hooks/useWorkDay';
import { cn, formatCurrency } from '@/lib/utils';
import type { Advance, Employee } from '@/types/workday';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { PatronPasswordDialog } from '@/components/workday/PatronPasswordDialog';

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
    const [editingAdvance, setEditingAdvance] = useState<Advance | null>(null);
    const [editForm, setEditForm] = useState({ amount: '', reason: '', given_on: '' });
    const [pendingAction, setPendingAction] = useState<
        | { type: 'edit'; advance: Advance; payload: Omit<Parameters<typeof updateAdvance>[1], 'password'> }
        | { type: 'delete'; advance: Advance }
        | null
    >(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

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

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateAdvance>[1] }) =>
            updateAdvance(id, payload),
        onSuccess: () => {
            invalidate();
            setEditingAdvance(null);
            setPendingAction(null);
            setPasswordError(null);
        },
        onError: (mutationError) => setPasswordError(getErrorMessage(mutationError)),
    });

    const deleteMutation = useMutation({
        mutationFn: ({ id, password }: { id: number; password: string }) => deleteAdvance(id, password),
        onSuccess: () => {
            invalidate();
            setPendingAction(null);
            setPasswordError(null);
        },
        onError: (mutationError) => setPasswordError(getErrorMessage(mutationError)),
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

    function startEdit(advance: Advance) {
        setEditingAdvance(advance);
        setEditForm({
            amount: String(advance.amount),
            reason: advance.reason ?? '',
            given_on: advance.given_on,
        });
    }

    function submitEdit() {
        if (!editingAdvance) return;
        const nextAmount = Number.parseFloat(editForm.amount.replace(',', '.'));
        if (!Number.isFinite(nextAmount) || nextAmount <= 0) return;
        setPasswordError(null);
        setPendingAction({
            type: 'edit',
            advance: editingAdvance,
            payload: {
                amount: nextAmount,
                reason: editForm.reason.trim() || null,
                given_on: editForm.given_on,
            },
        });
    }

    function confirmPendingAction(password: string) {
        if (!pendingAction) return;
        if (pendingAction.type === 'edit') {
            updateMutation.mutate({
                id: pendingAction.advance.id,
                payload: { ...pendingAction.payload, password },
            });
        } else {
            deleteMutation.mutate({ id: pendingAction.advance.id, password });
        }
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
                <p className="mt-3 rounded-md border border-dashed border-tint/[0.08] px-3 py-3 text-center text-xs text-muted-foreground">
                    Aucune avance enregistrée.
                </p>
            ) : (
                <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
                    {advances.map((advance) => {
                        const isEditing = editingAdvance?.id === advance.id;

                        if (isEditing) {
                            return (
                                <li
                                    key={advance.id}
                                    className="space-y-2 rounded-md border border-accent/25 bg-accent/[0.05] px-3 py-2.5"
                                >
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            inputMode="decimal"
                                            value={editForm.amount}
                                            onChange={(event) =>
                                                setEditForm((current) => ({ ...current, amount: event.target.value }))
                                            }
                                            className="h-8 tabular-nums"
                                        />
                                        <Input
                                            type="date"
                                            value={editForm.given_on}
                                            onChange={(event) =>
                                                setEditForm((current) => ({ ...current, given_on: event.target.value }))
                                            }
                                            className="h-8"
                                        />
                                    </div>
                                    <Input
                                        value={editForm.reason}
                                        onChange={(event) =>
                                            setEditForm((current) => ({ ...current, reason: event.target.value }))
                                        }
                                        placeholder="Motif (optionnel)"
                                        className="h-8"
                                    />
                                    <div className="flex items-center justify-end gap-1.5">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditingAdvance(null)}
                                            disabled={updateMutation.isPending}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                            Annuler
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="accent"
                                            size="sm"
                                            onClick={submitEdit}
                                            disabled={updateMutation.isPending}
                                        >
                                            {updateMutation.isPending && <Loader2 className="animate-spin" />}
                                            Enregistrer
                                        </Button>
                                    </div>
                                    {updateMutation.isError && (
                                        <p className="text-xs text-destructive">{getErrorMessage(updateMutation.error)}</p>
                                    )}
                                </li>
                            );
                        }

                        return (
                            <li
                                key={advance.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2"
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

                                <div className="flex shrink-0 items-center gap-1">
                                    {advance.settled_at ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-success">
                                            <Check className="h-3.5 w-3.5" />
                                            Réglée
                                        </span>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={settleMutation.isPending}
                                            onClick={() => settleMutation.mutate(advance.id)}
                                        >
                                            Solder
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Modifier l'avance"
                                        onClick={() => startEdit(advance)}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Supprimer l'avance"
                                        onClick={() => {
                                            setPasswordError(null);
                                            setPendingAction({ type: 'delete', advance });
                                        }}
                                    >
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="mt-4 space-y-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] p-3.5">
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
                    className={cn('w-full')}
                    disabled={!canSubmit || createMutation.isPending}
                    onClick={submit}
                >
                    {createMutation.isPending && <Loader2 className="animate-spin" />}
                    Enregistrer l’avance
                </Button>
            </div>

            <PatronPasswordDialog
                open={pendingAction !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingAction(null);
                        setPasswordError(null);
                    }
                }}
                title={pendingAction?.type === 'delete' ? 'Supprimer cette avance ?' : 'Confirmer la modification'}
                description={
                    pendingAction?.type === 'delete'
                        ? `L'avance de ${formatCurrency(pendingAction.advance.amount, { maximumFractionDigits: 2 })} du ${pendingAction.advance.given_on} sera définitivement supprimée. Cette action nécessite le mot de passe patron.`
                        : pendingAction?.type === 'edit'
                          ? "Toute correction d'une avance nécessite le mot de passe patron."
                          : undefined
                }
                confirmLabel={pendingAction?.type === 'edit' ? 'Enregistrer la correction' : undefined}
                tone={pendingAction?.type === 'edit' ? 'accent' : 'destructive'}
                loading={updateMutation.isPending || deleteMutation.isPending}
                error={passwordError}
                onConfirm={confirmPendingAction}
            />
        </motion.div>
    );
}
