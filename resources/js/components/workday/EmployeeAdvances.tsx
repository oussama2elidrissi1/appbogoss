import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, HandCoins, Loader2, Pencil, Trash2, X } from 'lucide-react';
import {
    createAdvance,
    deleteAdvance,
    getAdvances,
    getErrorMessage,
    getWorkDays,
    settleAdvancesBefore,
    updateAdvance,
} from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { workDayKeys } from '@/hooks/useWorkDay';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Advance, Employee } from '@/types/workday';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PatronPasswordDialog } from '@/components/workday/PatronPasswordDialog';

interface EmployeeAdvancesProps {
    employee: Employee;
    /** Attaches the advance to the open day when there is one. */
    workDayId?: number;
    /** "YYYY-MM" — keeps monthly context while still displaying the full history. */
    periodMonth?: string;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Outstanding balance, history and the "donner une avance" inline form. */
export function EmployeeAdvances({ employee, workDayId, periodMonth }: EmployeeAdvancesProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const { hasRole } = useAuth();
    const isSuperAdmin = hasRole('super-admin');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [givenOn, setGivenOn] = useState(today());
    const [selectedWorkDayId, setSelectedWorkDayId] = useState('');
    const [editingAdvance, setEditingAdvance] = useState<Advance | null>(null);
    const [editForm, setEditForm] = useState({ amount: '', reason: '', given_on: '', work_day_id: '' });
    const [pendingAction, setPendingAction] = useState<
        | { type: 'edit'; advance: Advance; payload: Omit<Parameters<typeof updateAdvance>[1], 'password'> }
        | { type: 'delete'; advance: Advance }
        | { type: 'settle-before'; before: string; total: number }
        | null
    >(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const { data, isPending } = useQuery({
        queryKey: workDayKeys.advances(employee.id),
        queryFn: () => getAdvances(employee.id),
    });

    // Which caisse day the cash for an advance actually came out of — defaults
    // to today's open day, but an admin can pick any other day (e.g. to
    // correctly attribute a catch-up payment to the day it was really handed
    // over, instead of leaving everything implicitly tied to "today").
    const { data: workDays } = useQuery({
        queryKey: ['work-days', 'picker'],
        queryFn: getWorkDays,
        staleTime: 60_000,
    });

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: workDayKeys.advances(employee.id) });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        void queryClient.invalidateQueries({ queryKey: ['commission-payouts'] });
    }

    const createMutation = useMutation({
        mutationFn: createAdvance,
        onSuccess: () => {
            invalidate();
            setAmount('');
            setReason('');
            setGivenOn(today());
            setSelectedWorkDayId('');
        },
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

    const settleBeforeMutation = useMutation({
        mutationFn: ({ before, password }: { before: string; password: string }) =>
            settleAdvancesBefore(employee.id, before, password),
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
        const chosenWorkDayId = selectedWorkDayId ? Number(selectedWorkDayId) : workDayId;
        createMutation.mutate({
            employee_id: employee.id,
            amount: amountValue,
            given_on: givenOn,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
            ...(chosenWorkDayId ? { work_day_id: chosenWorkDayId } : {}),
        });
    }

    function startEdit(advance: Advance) {
        setEditingAdvance(advance);
        setEditForm({
            amount: String(advance.amount),
            reason: advance.reason ?? '',
            given_on: advance.given_on,
            work_day_id: advance.work_day_id ? String(advance.work_day_id) : '',
        });
    }

    function submitEdit() {
        if (!editingAdvance) return;
        const nextAmount = Number.parseFloat(editForm.amount.replace(',', '.'));
        if (!Number.isFinite(nextAmount) || nextAmount <= 0) return;
        setPasswordError(null);

        const payload = {
            amount: nextAmount,
            reason: editForm.reason.trim() || null,
            given_on: editForm.given_on,
            work_day_id: editForm.work_day_id ? Number(editForm.work_day_id) : null,
        };

        // Super Admin already carries full authority — no second password prompt.
        if (isSuperAdmin) {
            updateMutation.mutate({ id: editingAdvance.id, payload: { ...payload, password: '' } });
            return;
        }

        setPendingAction({ type: 'edit', advance: editingAdvance, payload });
    }

    function confirmPendingAction(password: string) {
        if (!pendingAction) return;
        if (pendingAction.type === 'edit') {
            updateMutation.mutate({
                id: pendingAction.advance.id,
                payload: { ...pendingAction.payload, password },
            });
        } else if (pendingAction.type === 'delete') {
            deleteMutation.mutate({ id: pendingAction.advance.id, password });
        } else {
            settleBeforeMutation.mutate({ before: pendingAction.before, password });
        }
    }

    function requestSettleBefore(before: string, total: number) {
        setPasswordError(null);
        if (isSuperAdmin) {
            settleBeforeMutation.mutate({ before, password: '' });
            return;
        }
        setPendingAction({ type: 'settle-before', before, total });
    }

    const allAdvances = data?.data ?? [];
    const advances = allAdvances;
    const periodAdvances = periodMonth
        ? allAdvances.filter((advance) => advance.given_on.startsWith(periodMonth))
        : allAdvances;
    // The header total always matches the row summary and the payout math
    // above (which deducts every unsettled advance, any month). The list
    // below intentionally shows full history so old settled/unsettled rows
    // are never hidden from the admin.
    const outstandingTotal = data?.outstanding_total ?? 0;
    const periodOutstandingTotal = periodAdvances
        .filter((advance) => !advance.settled_at)
        .reduce((sum, advance) => sum + advance.amount, 0);
    const olderUnsettledTotal = outstandingTotal - periodOutstandingTotal;

    return (
        <div>
            <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <HandCoins className="h-4 w-4" />
                    {t('Avances en cours (total)')}
                </span>
                {isPending ? (
                    <Skeleton className="h-5 w-20" />
                ) : (
                    <span className="text-sm font-semibold tabular-nums text-accent">
                        {formatCurrency(outstandingTotal, { maximumFractionDigits: 2 })}
                    </span>
                )}
            </div>
            {periodMonth ? (
                <div className="mt-1 space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">
                        {t('Historique complet ci-dessous. Avances non soldées données pendant {month} : {amount}.', {
                            month: periodMonth,
                            amount: formatCurrency(periodOutstandingTotal, { maximumFractionDigits: 2 }),
                        })}
                        {olderUnsettledTotal > 0 && (
                            <>
                                {' '}
                                {t('Les {amount} restants du total ci-dessus viennent de mois précédents, toujours non soldés.', {
                                    amount: formatCurrency(olderUnsettledTotal, { maximumFractionDigits: 2 }),
                                })}
                            </>
                        )}
                    </p>
                    {olderUnsettledTotal > 0 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-accent hover:text-accent"
                            disabled={settleBeforeMutation.isPending}
                            onClick={() => requestSettleBefore(`${periodMonth}-01`, olderUnsettledTotal)}
                        >
                            {t('Déjà remboursées → solder les {amount} antérieures', {
                                amount: formatCurrency(olderUnsettledTotal, { maximumFractionDigits: 2 }),
                            })}
                        </Button>
                    )}
                </div>
            ) : (
                <p className="mt-1 text-[10px] text-muted-foreground">
                    {t("Toutes les avances non soldées, quel que soit le mois où elles ont été données — elles restent dues jusqu'à ce que la commission de cet employé soit marquée payée.")}
                </p>
            )}

            {isPending ? (
                <div className="mt-3 space-y-2">
                    {Array.from({ length: 2 }).map((_, index) => (
                        <Skeleton key={index} className="h-10 w-full rounded-md" />
                    ))}
                </div>
            ) : advances.length === 0 ? (
                <p className="mt-3 rounded-md border border-dashed border-tint/[0.08] px-3 py-3 text-center text-xs text-muted-foreground">
                    {t('Aucune avance enregistrée.')}
                </p>
            ) : (
                <ul className="mt-3 max-h-[34rem] space-y-1.5 overflow-y-auto pr-0.5">
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
                                        placeholder={t('Motif (optionnel)')}
                                        className="h-8"
                                    />
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-muted-foreground">
                                            {t('Journée de caisse')}
                                        </Label>
                                        <Select
                                            value={editForm.work_day_id}
                                            onValueChange={(value) =>
                                                setEditForm((current) => ({ ...current, work_day_id: value }))
                                            }
                                        >
                                            <SelectTrigger className="h-8">
                                                <SelectValue placeholder={t('Aucune')} />
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
                                    </div>
                                    <div className="flex items-center justify-end gap-1.5">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditingAdvance(null)}
                                            disabled={updateMutation.isPending}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                            {t('Annuler')}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="accent"
                                            size="sm"
                                            onClick={submitEdit}
                                            disabled={updateMutation.isPending}
                                        >
                                            {updateMutation.isPending && <Loader2 className="animate-spin" />}
                                            {t('Enregistrer')}
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
                                        {advance.work_day_date && advance.work_day_date !== advance.given_on
                                            ? ` · ${t('caisse du')} ${formatDate(advance.work_day_date)}`
                                            : ''}
                                        {advance.reason ? ` · ${advance.reason}` : ''}
                                    </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                    {advance.settled_at ? (
                                        <span
                                            className="inline-flex items-center gap-1 text-xs text-success"
                                            title={
                                                advance.commission_payout_period
                                                    ? t('Soldée automatiquement via la paie de {period}', { period: advance.commission_payout_period })
                                                    : undefined
                                            }
                                        >
                                            <Check className="h-3.5 w-3.5" />
                                            {advance.commission_payout_period
                                                ? t('Réglée (paie {period})', { period: advance.commission_payout_period })
                                                : t('Réglée')}
                                        </span>
                                    ) : (
                                        <span
                                            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                                            title={t('Elle sera automatiquement déduite quand vous marquerez la commission du mois comme payée.')}
                                        >
                                            <HandCoins className="h-3.5 w-3.5" />
                                            {t('Déduite à la paie')}
                                        </span>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label={t("Modifier l'avance")}
                                        onClick={() => startEdit(advance)}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label={t("Supprimer l'avance")}
                                        onClick={() => {
                                            setPasswordError(null);
                                            if (isSuperAdmin) {
                                                deleteMutation.mutate({ id: advance.id, password: '' });
                                                return;
                                            }
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
                    {t('Donner une avance')}
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                        <Label htmlFor={`advance-amount-${employee.id}`} className="text-xs">
                            {t('Montant')}
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
                            {t('Date')}
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
                        {t('Motif')} <span className="font-normal">{t('(optionnel)')}</span>
                    </Label>
                    <Input
                        id={`advance-reason-${employee.id}`}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={t('Ex. dépannage personnel')}
                        className="h-9"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs">
                        {t('Journée de caisse')} <span className="font-normal">{t('(optionnel)')}</span>
                    </Label>
                    <Select value={selectedWorkDayId} onValueChange={setSelectedWorkDayId}>
                        <SelectTrigger className="h-9">
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
                        {t('Pour un versement rattrapant une avance d’une autre journée déjà clôturée.')}
                    </p>
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
                    {t('Enregistrer l’avance')}
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
                title={
                    pendingAction?.type === 'delete'
                        ? t('Supprimer cette avance ?')
                        : pendingAction?.type === 'settle-before'
                          ? t('Solder ces avances antérieures ?')
                          : t('Confirmer la modification')
                }
                description={
                    pendingAction?.type === 'delete'
                        ? t("L'avance de {amount} du {date} sera définitivement supprimée. Cette action nécessite le mot de passe patron.", {
                              amount: formatCurrency(pendingAction.advance.amount, { maximumFractionDigits: 2 }),
                              date: pendingAction.advance.given_on,
                          })
                        : pendingAction?.type === 'edit'
                          ? t("Toute correction d'une avance nécessite le mot de passe patron.")
                          : pendingAction?.type === 'settle-before'
                            ? t("{amount} d'avances antérieures à ce mois seront marquées réglées, sans créer de paiement de commission. À utiliser seulement si cet argent a déjà été remboursé en dehors de l'application. Cette action nécessite le mot de passe patron.", {
                                  amount: formatCurrency(pendingAction.total, { maximumFractionDigits: 2 }),
                              })
                            : undefined
                }
                confirmLabel={
                    pendingAction?.type === 'edit'
                        ? t('Enregistrer la correction')
                        : pendingAction?.type === 'settle-before'
                          ? t('Solder ces avances')
                          : undefined
                }
                tone={pendingAction?.type === 'edit' ? 'accent' : 'destructive'}
                loading={updateMutation.isPending || deleteMutation.isPending || settleBeforeMutation.isPending}
                error={passwordError}
                onConfirm={confirmPendingAction}
            />
        </div>
    );
}
