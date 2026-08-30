/**
 * Clôture mensuelle.
 *
 * Un mois n'est jamais « ouvert » par un enregistrement : il l'est tant
 * qu'aucune clôture ne le ferme, et le mois courant se déduit de la date.
 * Septembre démarre donc seul à minuit, compteurs à zéro, parce qu'aucune
 * ligne ne porte encore ses dates — rien n'est remis à zéro nulle part.
 */

export type PeriodStatus = 'current' | 'to_finalize' | 'closed';

export interface PeriodSummary {
    period: string;
    status: PeriodStatus;
    closed_at?: string;
    closed_by?: string | null;
}

export interface PeriodsResponse {
    current: string;
    /** Mois d'activation de la clôture ; les mois antérieurs sont hors périmètre. */
    start_period: string | null;
    to_finalize: PeriodSummary[];
    closed: PeriodSummary[];
}

export interface ClosureEmployeeRow {
    employee_id: number;
    employee_name: string;
    avatar_color: string;
    /** Commission gagnée sur le mois — même calcul que l'écran Paie. */
    earned: number;
    advances_applied: number;
    payouts_total: number;
    remaining_to_pay: number;
    /**
     * Avance qui dépasse la commission du mois et se reporte au mois suivant.
     * Ne bloque PAS la clôture : c'est la règle de paie existante.
     */
    carry_forward_advance: number;
    advances_outstanding: number;
    settled: boolean;
}

export interface ClosureWorkDays {
    total: number;
    closed: number;
    open: number;
    all_closed: boolean;
    open_days: { id: number; date: string }[];
}

export interface ClosurePartnerInformation {
    informational: true;
    pending_total: number;
    partners: { partner_id: number; partner_name: string | null; amount: number }[];
}

export interface ClosureTotals {
    employees_count: number;
    commission_total: number;
    payouts_total: number;
    advances_applied_total: number;
    remaining_total: number;
    carry_forward_total: number;
}

export interface ClosureChecklist {
    period: string;
    status: PeriodStatus;
    can_close: boolean;
    blocking_reasons: string[];
    employees: ClosureEmployeeRow[];
    work_days: ClosureWorkDays;
    /** Informatif uniquement — les partenaires ne bloquent jamais la clôture. */
    partner_information: ClosurePartnerInformation;
    closure: { closed_at: string; closed_by: string | null; notes: string | null } | null;
    totals: ClosureTotals;
}

export interface MonthlyClosureRow {
    id: number;
    period: string;
    status: 'closed';
    closed_at: string;
    closed_by: string | null;
    notes: string | null;
    employees_count: number;
    commission_total: number;
    payouts_total: number;
    advances_applied_total: number;
    work_days_count: number;
    closing_report: {
        period: string;
        closed_at: string;
        closed_by: { id: number; name: string };
        employees: ClosureEmployeeRow[];
        work_days: ClosureWorkDays;
        partner_information: ClosurePartnerInformation;
        totals: ClosureTotals;
    } | null;
}
