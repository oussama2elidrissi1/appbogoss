import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClosureChecklist } from '@/types/closure';

/** Combien d'employés restent à payer, et lesquels. */
export function unsettledEmployees(checklist: ClosureChecklist) {
    return checklist.employees.filter((row) => !row.settled);
}

export function employeesHint(checklist: ClosureChecklist): string {
    const unsettled = unsettledEmployees(checklist);
    if (checklist.employees.length === 0) return 'Aucun employé concerné par ce mois.';
    if (unsettled.length === 0) return `Les ${checklist.employees.length} employés du mois sont soldés.`;
    if (unsettled.length === 1) return `Il reste 1 employé à payer : ${unsettled[0].employee_name}.`;
    return `Il reste ${unsettled.length} employés à payer sur ${checklist.employees.length}.`;
}

export function workDaysHint(checklist: ClosureChecklist): string {
    const { total, open, all_closed } = checklist.work_days;
    if (total === 0) return 'Aucune journée de caisse sur ce mois.';
    if (all_closed) return `Les ${total} journées du mois sont clôturées.`;
    return open === 1
        ? 'Il reste 1 journée de caisse à clôturer.'
        : `Il reste ${open} journées de caisse à clôturer.`;
}

/**
 * La procédure de clôture, en trois étapes, avec l'état réel de chacune.
 *
 * Sans elle, l'écran n'annonçait que des refus : on voyait ce qui n'allait pas,
 * jamais quoi faire ni dans quel ordre. Chaque étape est formulée en action —
 * « il reste 2 employés à payer » — plutôt qu'en constat.
 */
export function ClosureProcedure({ checklist }: { checklist: ClosureChecklist }) {
    const employeesDone = unsettledEmployees(checklist).length === 0;
    const workDaysDone = checklist.work_days.all_closed;

    return (
        <section className="rounded-lg border bg-muted/40 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Comment clôturer ce mois
            </h3>
            <ol className="mt-3 space-y-3">
                <Step number={1} title="Payer les employés" detail={employeesHint(checklist)} done={employeesDone} />
                <Step
                    number={2}
                    title="Clôturer les journées de caisse"
                    detail={workDaysHint(checklist)}
                    done={workDaysDone}
                />
                <Step
                    number={3}
                    title="Confirmer la clôture"
                    detail={
                        checklist.can_close
                            ? 'Cochez la case en bas, puis clôturez.'
                            : 'Disponible une fois les étapes 1 et 2 terminées.'
                    }
                    done={false}
                    pending={!checklist.can_close}
                />
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">
                Une fois clôturé, ce mois ne pourra plus être modifié, ni rouvert.
            </p>
        </section>
    );
}

function Step({
    number,
    title,
    detail,
    done,
    pending = false,
}: {
    number: number;
    title: string;
    detail: string;
    done: boolean;
    /** Étape pas encore atteignable : grisée, pas en échec — son tour n'est simplement pas venu. */
    pending?: boolean;
}) {
    return (
        <li className="flex items-start gap-3">
            <span
                className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
                    done && 'border-emerald-500/45 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                    !done && pending && 'border-muted-foreground/30 text-muted-foreground',
                    !done && !pending && 'border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-400',
                )}
            >
                {done ? <Check className="h-3.5 w-3.5" /> : number}
            </span>
            <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{detail}</p>
            </div>
        </li>
    );
}
