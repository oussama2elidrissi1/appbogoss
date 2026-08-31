import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { closeMonth, getClosureChecklist, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPeriod } from '@/components/closure/PeriodSelector';
import { ClosureProcedure } from '@/components/closure/ClosureProcedure';

/**
 * Vérification puis clôture définitive d'un mois.
 *
 * La checklist est rechargée à chaque ouverture — jamais mise en cache. Elle
 * n'est de toute façon pas ce qui autorise la clôture : le serveur la
 * reconstruit entièrement dans sa transaction au moment du POST, parce qu'une
 * checklist affichée depuis deux minutes peut déjà être fausse.
 */
export function MonthClosureDialog({
    period,
    open,
    onOpenChange,
    onClosed,
}: {
    period: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onClosed?: () => void;
}) {
    const queryClient = useQueryClient();
    const [checked, setChecked] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setChecked(false);
            setError(null);
        }
    }, [open, period]);

    const {
        data: checklist,
        isPending,
        isError,
        error: loadError,
    } = useQuery({
        queryKey: ['closure-checklist', period],
        queryFn: () => getClosureChecklist(period),
        enabled: open,
        staleTime: 0,
        gcTime: 0,
    });

    const mutation = useMutation({
        mutationFn: () => closeMonth({ period, confirmed: true }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['periods'] });
            void queryClient.invalidateQueries({ queryKey: ['commission-payouts'] });
            void queryClient.invalidateQueries({ queryKey: ['monthly-closures'] });
            void queryClient.invalidateQueries({ queryKey: ['closure-checklist', period] });
            onOpenChange(false);
            onClosed?.();
        },
        onError: (mutationError) => setError(getErrorMessage(mutationError)),
    });

    const canClose = checklist?.can_close ?? false;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarCheck className="h-5 w-5" />
                        <span className="capitalize">Clôture — {formatPeriod(period)}</span>
                    </DialogTitle>
                    <DialogDescription>
                        Vérification complète avant la clôture définitive du mois.
                    </DialogDescription>
                </DialogHeader>

                {isPending && (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                )}

                {isError && (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        {getErrorMessage(loadError)}
                    </p>
                )}

                {checklist && (
                    <div className="space-y-5">
                        {/* La procedure d'abord, les details ensuite : sans elle
                            l'ecran n'annoncait que des refus. */}
                        <ClosureProcedure checklist={checklist} />

                        {checklist.blocking_reasons.length > 0 && (
                            <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                                {checklist.blocking_reasons.map((reason) => (
                                    <li key={reason} className="flex items-start gap-2">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                        <span>{reason}</span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <section>
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Employés ({checklist.employees.length})
                            </h3>
                            {checklist.employees.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Aucun employé n'a de situation financière sur ce mois.
                                </p>
                            ) : (
                                <ul className="divide-y rounded-lg border">
                                    {checklist.employees.map((row) => (
                                        <li key={row.employee_id} className="flex items-center gap-3 p-3">
                                            {row.settled ? (
                                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                            ) : (
                                                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">{row.employee_name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {row.settled
                                                        ? 'Soldé'
                                                        : `Reste ${formatCurrency(row.remaining_to_pay)}`}
                                                    {row.carry_forward_advance > 0 && (
                                                        <>
                                                            {' · '}
                                                            {/* Le reliquat se reporte au mois suivant, c'est la
                                                                règle de paie existante : il ne bloque pas. */}
                                                            Avance reportée&nbsp;:{' '}
                                                            {formatCurrency(row.carry_forward_advance)}
                                                        </>
                                                    )}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                                                {formatCurrency(row.earned)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section>
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Journées de caisse
                            </h3>
                            {checklist.work_days.all_closed ? (
                                <p className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    {checklist.work_days.total === 0
                                        ? 'Aucune journée de caisse sur ce mois.'
                                        : `Toutes clôturées (${checklist.work_days.total}).`}
                                </p>
                            ) : (
                                <ul className="divide-y rounded-lg border">
                                    {checklist.work_days.open_days.map((day) => (
                                        <li key={day.id} className="flex items-center gap-2 p-3 text-sm">
                                            <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                                            {formatDate(day.date)} — journée encore ouverte
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        {checklist.partner_information.pending_total > 0 && (
                            <section>
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Partenaires — information
                                </h3>
                                <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                                    {formatCurrency(checklist.partner_information.pending_total)} de commissions
                                    partenaires non réglées sur ce mois. Informatif&nbsp;: cela n'empêche pas la
                                    clôture.
                                </p>
                            </section>
                        )}

                        {canClose && (
                            <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                                <p className="text-sm">
                                    Vous allez clôturer définitivement le mois de{' '}
                                    <span className="font-semibold capitalize">{formatPeriod(period)}</span>. Une fois
                                    clôturé, ce mois ne sera plus accessible en modification depuis l'espace Admin.
                                    Vérifiez tous les paiements avant de continuer.
                                </p>
                                <label className="flex cursor-pointer items-start gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5"
                                        checked={checked}
                                        onChange={(event) => setChecked(event.target.checked)}
                                    />
                                    <span>
                                        J'ai vérifié tous les employés, tous les paiements et toutes les journées de
                                        caisse du mois.
                                    </span>
                                </label>
                            </div>
                        )}

                        {error && (
                            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                                {error}
                            </p>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Annuler
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={!canClose || !checked || mutation.isPending}
                        onClick={() => {
                            setError(null);
                            mutation.mutate();
                        }}
                    >
                        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        CLÔTURER DÉFINITIVEMENT
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
