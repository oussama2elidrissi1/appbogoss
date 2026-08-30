import { AlertTriangle, CalendarClock, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PeriodStatus, PeriodsResponse } from '@/types/closure';

export function formatPeriod(period: string): string {
    const [year, month] = period.split('-').map(Number);
    if (!year || !month) return period;
    return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
    current: 'En cours',
    to_finalize: 'À finaliser',
    closed: 'Clôturé',
};

/**
 * Sélecteur de période à statut.
 *
 * Remplace le `<input type="month">` : un mois n'est pas qu'une date, il est
 * en cours, à finaliser ou clôturé, et cette distinction décide de ce que
 * l'écran autorise. Les mois clôturés ne sont proposés qu'au Super Admin —
 * pour l'Admin, un mois clôturé a quitté ses écrans pour de bon.
 */
export function currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function PeriodSelector({
    periods,
    value,
    onChange,
    includeClosed = false,
}: {
    periods: PeriodsResponse | undefined;
    value: string;
    onChange: (period: string) => void;
    includeClosed?: boolean;
}) {
    // Jamais `null` : ce sélecteur a REMPLACÉ l'<input type="month"> de la
    // page Paie. S'effacer quand /api/periods ne répond pas ferait disparaître
    // le choix du mois avec lui — l'écran perdrait une fonction qu'il avait
    // déjà. Sans réponse serveur, on retombe donc sur le mois courant calculé
    // localement, ce qui suffit à garder l'écran utilisable.
    const resolved: PeriodsResponse = periods ?? {
        current: currentMonth(),
        start_period: null,
        to_finalize: [],
        closed: [],
    };

    const options: { period: string; status: PeriodStatus }[] = [
        { period: resolved.current, status: 'current' },
        ...resolved.to_finalize.map((entry) => ({ period: entry.period, status: 'to_finalize' as const })),
        ...(includeClosed
            ? resolved.closed.map((entry) => ({ period: entry.period, status: 'closed' as const }))
            : []),
    ];

    // Une période sélectionnée hors liste (lien direct, mois clôturé pendant
    // que l'écran était ouvert) reste affichée plutôt que de disparaître
    // silencieusement du sélecteur.
    if (!options.some((option) => option.period === value)) {
        options.push({ period: value, status: value === resolved.current ? 'current' : 'to_finalize' });
    }

    return (
        <div className="flex flex-wrap gap-2">
            {options.map((option) => (
                <button
                    key={option.period}
                    type="button"
                    onClick={() => onChange(option.period)}
                    aria-pressed={option.period === value}
                    className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition',
                        option.period === value
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border hover:bg-muted',
                    )}
                >
                    <PeriodStatusIcon status={option.status} />
                    <span className="leading-tight">
                        <span className="block text-sm font-medium capitalize">{formatPeriod(option.period)}</span>
                        <span className="block text-[11px] uppercase tracking-wide opacity-70">
                            {PERIOD_STATUS_LABEL[option.status]}
                        </span>
                    </span>
                </button>
            ))}
        </div>
    );
}

export function PeriodStatusIcon({ status, className }: { status: PeriodStatus; className?: string }) {
    const Icon = status === 'closed' ? Lock : status === 'to_finalize' ? AlertTriangle : CalendarClock;
    return <Icon className={cn('h-4 w-4 shrink-0', className)} />;
}

export function PeriodStatusBadge({ status }: { status: PeriodStatus }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                status === 'closed' && 'border-muted-foreground/30 text-muted-foreground',
                status === 'to_finalize' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                status === 'current' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
            )}
        >
            {status === 'closed' ? <Check className="h-3 w-3" /> : <PeriodStatusIcon status={status} className="h-3 w-3" />}
            {PERIOD_STATUS_LABEL[status]}
        </span>
    );
}
