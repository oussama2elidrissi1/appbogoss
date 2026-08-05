export interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    roles: string[];
    permissions: string[];
    employee_id: number | null;
    employee_name: string | null;
    /** Service catalog categories the linked employee performs — empty means no restriction. */
    employee_service_categories: string[];
}

export interface ApplicationSettings {
    salon_name: string;
    salon_phone: string;
    salon_email: string;
    salon_address: string;
    currency: string;
    receipt_footer: string;
    logo_url: string | null;
}

export interface ApplicationSettingsPayload {
    salon_name: string;
    salon_phone?: string | null;
    salon_email?: string | null;
    salon_address?: string | null;
    currency: string;
    receipt_footer?: string | null;
    logo?: File | null;
}

export interface DashboardKpis {
    revenue_today: number;
    revenue_month: number;
    revenue_trend_pct: number;
    appointments_today: number;
    appointments_trend_pct: number;
    clients_total: number;
    clients_new_this_month: number;
    employees_active: number;
    expenses_month: number;
    /** Clients servis aujourd'hui — alimenté par la journée d'exploitation en cours. */
    clients_today: number;
}

/** Live snapshot of the open work day, mirrored on the dashboard. */
export interface ActiveDaySummary {
    id: number;
    /** 'YYYY-MM-DD' */
    date: string;
    opening_balance: number;
    employees_present: number;
    revenue_so_far: number;
    expenses_so_far: number;
    advances_so_far: number;
    commissions_so_far: number;
    cash_on_hand: number;
}

export interface RevenuePoint {
    /** 'YYYY-MM-DD' */
    date: string;
    revenue: number;
    expenses: number;
}

export interface LowStockProduct {
    id: number;
    name: string;
    stock_quantity: number;
    low_stock_threshold: number;
    category: string;
}

export type ActivityType = 'sale' | 'appointment' | 'client';

export interface ActivityItem {
    id: number;
    type: ActivityType;
    label: string;
    description: string;
    amount: number | null;
    /** ISO timestamp */
    created_at: string;
}

export interface QueuedAppointment {
    id: number;
    client_name: string;
    service_name: string;
    employee_name: string;
    /** ISO timestamp */
    starts_at: string;
    status: string;
    service_color: string;
}

export interface DashboardData {
    kpis: DashboardKpis;
    revenue_series: RevenuePoint[];
    low_stock_products: LowStockProduct[];
    recent_activity: ActivityItem[];
    appointment_queue: QueuedAppointment[];
    /** `null` when no work day is open. */
    active_day: ActiveDaySummary | null;
}
