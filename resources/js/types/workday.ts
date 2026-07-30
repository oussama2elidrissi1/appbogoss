/**
 * Types for the "Exploitation Quotidienne" module — the daily operations flow
 * (open day → encaissements / dépenses / avances → clôture + rapport).
 *
 * Shapes mirror the Laravel API contract exactly. Note that these endpoints wrap
 * their payload in `{ "data": ... }`, unlike `/api/dashboard` which returns bare.
 */

/** The six transaction categories accepted by `POST /api/transactions`. */
export type TransactionCategory =
    | 'coiffure'
    | 'hammam'
    | 'massage'
    | 'boisson'
    | 'vitrine'
    | 'autre';

export type WorkDayStatus = 'open' | 'closed';

export interface WorkDayEmployee {
    id: number;
    name: string;
    avatar_color: string;
    role: string;
    present: boolean;
}

export interface RevenueByCategory {
    /** Raw backend string — resolve through a lookup with a fallback, not a union cast. */
    category: string;
    total: number;
    count: number;
}

export interface RevenueByEmployee {
    employee_id: number;
    employee_name: string;
    total: number;
    commission: number;
    count: number;
    prestations?: TopPrestation[];
}

export interface TopPrestation {
    label: string;
    count: number;
    total: number;
}

export interface PrestationByEmployee extends TopPrestation {
    employees: RevenueByEmployee[];
}

export interface ExpenseReportRow {
    id?: number;
    label?: string;
    category: string;
    count?: number;
    amount?: number;
    total: number;
    spent_on?: string;
}

export interface AdvanceReportRow {
    id?: number;
    employee_id: number;
    employee_name: string;
    count?: number;
    amount?: number;
    total: number;
    settled_total?: number;
    reason?: string | null;
    given_on?: string;
    settled_at?: string | null;
}

export interface ClosingReport {
    opening_balance?: number;
    revenue_total: number;
    expenses_total: number;
    advances_total: number;
    commissions_total: number;
    net_result: number;
    clients_count: number;
    average_ticket: number;
    cash_expected?: number;
    ticket_count?: number;
    deleted_ticket_count?: number;
    deleted_ticket_total?: number;
    print_count?: number;
    printed_ticket_count?: number;
    revenue_by_category: RevenueByCategory[];
    revenue_by_employee: RevenueByEmployee[];
    employee_by_prestation?: RevenueByEmployee[];
    prestation_by_employee?: PrestationByEmployee[];
    top_prestations: TopPrestation[];
    expenses_by_category?: ExpenseReportRow[];
    expense_details?: ExpenseReportRow[];
    advances_by_employee?: AdvanceReportRow[];
    advance_details?: AdvanceReportRow[];
    payment_methods?: Array<{ method: string; count: number; total: number }>;
    ticket_details?: Array<{
        id: number;
        created_at: string | null;
        employee_id: number | null;
        employee_name: string;
        client_name: string;
        category: string | null;
        label: string;
        total: number;
        print_count: number;
        printed_ticket_count?: number;
        is_deleted: boolean;
    }>;
}

export interface MonthlyReport {
    period: { month: string; start: string; end: string };
    totals: ClosingReport;
    days: Array<{
        id: number;
        date: string;
        status: WorkDayStatus;
        opening_balance: number;
        closed_at: string | null;
        tickets: number;
        deleted_tickets: number;
        revenue_total: number;
        expenses_total: number;
        advances_total: number;
        commissions_total: number;
        net_result: number;
        top_prestations: TopPrestation[];
    }>;
}

export interface WorkDay {
    id: number;
    /** 'YYYY-MM-DD' */
    date: string;
    status: WorkDayStatus;
    opening_balance: number;
    /** ISO timestamp */
    closed_at: string | null;
    notes: string | null;
    opened_by: { id: number; name: string } | null;
    employees: WorkDayEmployee[];
    advances: Advance[];
    closing_report: ClosingReport | null;
    report_snapshot: ClosingReport | null;
}

export interface OpenWorkDayPayload {
    opening_balance: number;
    notes?: string;
    employee_ids: number[];
}

export interface SaleItem {
    id: number;
    label: string;
    quantity: number;
    unit_price: number;
}

export interface Sale {
    id: number;
    work_day_id: number;
    category: string;
    total: number;
    commission_amount: number | null;
    payment_method: string;
    print_count: number;
    printed_ticket_count?: number;
    /** ISO timestamp */
    created_at: string;
    /** ISO timestamp */
    deleted_at: string | null;
    is_deleted: boolean;
    client: { id: number; name: string } | null;
    client_label: string | null;
    employee: { id: number; name: string; avatar_color: string };
    items: SaleItem[];
}

export interface CreateTransactionPayload {
    employee_id: number;
    product_id?: number | null;
    client_id?: number | null;
    client_label?: string | null;
    category: TransactionCategory;
    label: string;
    price: number;
    commission_amount?: number | null;
    payment_method?: string;
}

export interface Advance {
    id: number;
    employee_id: number;
    employee_name: string;
    work_day_id: number | null;
    amount: number;
    reason: string | null;
    /** 'YYYY-MM-DD' */
    given_on: string;
    /** ISO timestamp */
    settled_at: string | null;
}

export interface CreateAdvancePayload {
    employee_id: number;
    amount: number;
    reason?: string;
    /** 'YYYY-MM-DD' */
    given_on: string;
    work_day_id?: number;
}

/**
 * `GET /api/advances` is the one endpoint carrying a sibling field next to `data`,
 * so this envelope is returned whole rather than unwrapped.
 */
export interface AdvancesResponse {
    data: Advance[];
    outstanding_total: number;
}

export interface Expense {
    id: number;
    work_day_id: number | null;
    label: string;
    category: string;
    amount: number;
    /** 'YYYY-MM-DD' */
    spent_on: string;
}

export interface CreateExpensePayload {
    label: string;
    category: string;
    amount: number;
    /** 'YYYY-MM-DD' */
    spent_on: string;
    work_day_id?: number;
}

export interface Employee {
    id: number;
    name: string;
    role: string;
    email: string | null;
    phone: string | null;
    avatar_color: string;
    specialties: string[];
    is_active: boolean;
    default_commission_rate: number | null;
}

export interface EmployeePayload {
    name?: string;
    role?: string;
    email?: string | null;
    phone?: string | null;
    avatar_color?: string;
    specialties?: string[];
    is_active?: boolean;
    default_commission_rate?: number | null;
}

export interface Client {
    id: number;
    name: string;
    email?: string | null;
    phone: string | null;
    avatar_color?: string;
    loyalty_points: number;
    notes?: string | null;
    last_visit_at?: string | null;
    sales_count?: number;
    appointments_count?: number;
}

export interface ClientPayload {
    name: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    avatar_color?: string | null;
}

export interface Service {
    id: number;
    name: string;
    category: string;
    price: number;
    duration_minutes: number;
    color: string;
    is_active: boolean;
}

export interface ServicePayload {
    name?: string;
    category?: string;
    price?: number;
    duration_minutes?: number;
    color?: string;
    is_active?: boolean;
}

export interface Product {
    id: number;
    name: string;
    sku: string;
    category: string;
    stock_area: 'vitrine' | 'refrigerateur';
    price: number;
    cost: number;
    stock_quantity: number;
    low_stock_threshold: number;
}

export interface ProductPayload {
    name?: string;
    sku?: string | null;
    category?: string;
    stock_area?: 'vitrine' | 'refrigerateur';
    price?: number;
    cost?: number | null;
    stock_quantity?: number;
    low_stock_threshold?: number;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Appointment {
    id: number;
    client_id: number;
    employee_id: number;
    service_id: number;
    starts_at: string;
    ends_at: string;
    status: AppointmentStatus;
    notes: string | null;
    client: { id: number; name: string; phone: string | null } | null;
    employee: { id: number; name: string; avatar_color: string } | null;
    service: {
        id: number;
        name: string;
        category: string;
        duration_minutes: number;
        price: number;
        color: string;
    } | null;
}

export interface AppointmentPayload {
    client_id?: number;
    employee_id?: number;
    service_id?: number;
    starts_at?: string;
    status?: AppointmentStatus;
    notes?: string | null;
}
