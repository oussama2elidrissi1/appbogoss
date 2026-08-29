import type { PrestationStatus } from '@/types/prestation';
import type { AppointmentStatus } from '@/types/workday';

export interface EmployeeWorkspaceProfile {
    id: number;
    name: string;
    role: string | null;
    avatar_color: string | null;
    specialties: string[];
}

export interface EmployeeKpis {
    date: string;
    prestations_count: number;
    prestations_delta: number;
    revenue: number;
    commission: number;
    /** Pourboires reçus (jamais comptés dans revenue — §40). */
    tips: number;
    /** Part des pourboires déjà comprise dans commission (50% coiffure). */
    tips_commission: number;
    monthly_commission: number;
    paid_commission: number;
}

export interface EmployeePrestationRow {
    id: number;
    reference: string;
    date: string;
    time: string;
    client_id: number | null;
    client_name: string;
    client_phone: string | null;
    service: string;
    duration_minutes: number;
    amount: number;
    commission: number;
    tips: number;
    status: PrestationStatus;
}

export interface EmployeeAgendaRow {
    id: number;
    client_id: number | null;
    client_name: string;
    client_phone: string | null;
    starts_at: string;
    ends_at: string;
    time: string;
    service: string;
    services: Array<Record<string, unknown>>;
    duration_minutes: number;
    amount: number;
    status: AppointmentStatus | string;
    notes: string | null;
    origin: string;
}

export interface EmployeeCommissionPoint {
    date: string;
    amount: number;
}

export interface EmployeeServiceDistributionRow {
    label: string;
    count: number;
    percent: number;
}

export interface EmployeeTopServiceRow {
    label: string;
    count: number;
    total: number;
}

export interface EmployeeReviewSummary {
    average: number | null;
    count: number;
    latest: {
        client_name: string;
        rating: number;
        comment: string | null;
        reviewed_at: string | null;
    } | null;
}

export interface EmployeeWorkspaceDashboard {
    employee: EmployeeWorkspaceProfile;
    today: EmployeeKpis;
    prestations_today: EmployeePrestationRow[];
    agenda_today: EmployeeAgendaRow[];
    next_appointment: EmployeeAgendaRow | null;
    commission_evolution: EmployeeCommissionPoint[];
    service_distribution: EmployeeServiceDistributionRow[];
    top_services: EmployeeTopServiceRow[];
    reviews: EmployeeReviewSummary;
    daily_tip: string;
}

export interface EmployeeCommissionsResponse {
    summary: {
        today: number;
        week: number;
        month: number;
        validated: number;
        paid: number;
        pending: number;
        tips: number;
        tips_commission: number;
    };
    evolution: EmployeeCommissionPoint[];
    rows: Array<{
        id: number;
        date: string;
        client_name: string;
        service_name: string;
        service_price: number;
        type: string;
        amount: number;
        status: string;
    }>;
    advances: Array<{
        id: number;
        amount: number;
        reason: string | null;
        given_on: string | null;
        settled_at: string | null;
        work_day_date: string | null;
        commission_payout_period: string | null;
    }>;
    payouts: Array<{
        id: number;
        period: string;
        commission_total: number;
        advances_deducted: number;
        net_amount: number;
        paid_at: string | null;
        paid_by: string | null;
    }>;
}

export interface EmployeeStatisticsResponse {
    period: { from: string; to: string };
    kpis: {
        prestations: number;
        revenue: number;
        tips: number;
        tips_commission: number;
        commission_generated: number;
        commission_paid: number;
        average_rating: number | null;
        clients_served: number;
        average_duration: number;
    };
    commission_evolution: EmployeeCommissionPoint[];
    service_distribution: EmployeeServiceDistributionRow[];
    top_services: EmployeeTopServiceRow[];
    active_days: Array<{ day: string; count: number }>;
}

export interface EmployeeClientRow {
    id: number;
    name: string;
    phone: string | null;
    avatar_color: string | null;
    prestations_count: number;
    last_visit_at: string | null;
    usual_services: Array<{ label: string; count: number }>;
    notes: string | null;
}

export interface EmployeeReviewsResponse {
    summary: EmployeeReviewSummary;
    rows: Array<{
        id: number;
        client_name: string;
        rating: number;
        comment: string | null;
        reviewed_at: string | null;
    }>;
}

export interface EmployeeDocumentsResponse {
    documents: Array<{
        id: number;
        title: string;
        type: string;
        url: string;
        updated_at: string | null;
    }>;
    empty_state: string;
}

export interface EmployeeSupportConversation {
    id: number;
    subject: string;
    category: string | null;
    status: string;
    last_message_at: string | null;
    last_message_preview: string | null;
}

export interface EmployeeSupportDetail extends EmployeeSupportConversation {
    messages: Array<{
        id: number;
        body: string;
        author_name: string | null;
        is_mine: boolean;
        created_at: string | null;
    }>;
}
