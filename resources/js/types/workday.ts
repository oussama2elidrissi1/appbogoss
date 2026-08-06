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
    cash_in_total?: number;
    cash_out_total?: number;
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
    closing_balance_actual: number | null;
    closing_variance: number | null;
    closing_comment: string | null;
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
    employee_id: number | null;
    product_id?: number | null;
    /** Catalog service this line matches — lets the server auto-calculate commission from the employee's rules. */
    service_id?: number | null;
    client_id?: number | null;
    client_label?: string | null;
    category: TransactionCategory;
    label: string;
    price: number;
    /** Omit (or leave null) to let the server auto-calculate; send a number to override it. */
    commission_amount?: number | null;
    payment_method?: string;
}

export interface Advance {
    id: number;
    employee_id: number;
    employee_name: string;
    work_day_id: number | null;
    /** 'YYYY-MM-DD' — the caisse day this advance's cash actually came out of. */
    work_day_date: string | null;
    amount: number;
    reason: string | null;
    /** 'YYYY-MM-DD' */
    given_on: string;
    /** ISO timestamp */
    settled_at: string | null;
    /** Set when this advance was auto-settled by a monthly commission payout rather than manually. */
    commission_payout_id: number | null;
    /** 'YYYY-MM', present alongside commission_payout_id. */
    commission_payout_period: string | null;
}

export interface CreateAdvancePayload {
    employee_id: number;
    amount: number;
    reason?: string;
    /** 'YYYY-MM-DD' */
    given_on: string;
    work_day_id?: number;
}

export interface UpdateAdvancePayload {
    amount?: number;
    reason?: string | null;
    /** 'YYYY-MM-DD' */
    given_on?: string;
    /** Re-attributes the advance to a different caisse day — e.g. correcting one that was wrongly linked to today instead of when the cash actually left the register. */
    work_day_id?: number | null;
    /** Patron-only password — required server-side to correct an advance. */
    password: string;
}

/**
 * `GET /api/advances` is the one endpoint carrying a sibling field next to `data`,
 * so this envelope is returned whole rather than unwrapped.
 */
export interface AdvancesResponse {
    data: Advance[];
    outstanding_total: number;
}

export interface AdvancesReportEmployeeGroup {
    employee_id: number;
    employee_name: string;
    count: number;
    total: number;
    settled_total: number;
    outstanding_total: number;
}

export interface AdvancesReportDetail {
    id: number;
    employee_id: number;
    employee_name: string;
    amount: number;
    reason: string | null;
    /** 'YYYY-MM-DD' */
    given_on: string;
    settled_at: string | null;
}

export interface AdvancesReport {
    period: { from: string; to: string };
    total: number;
    settled_total: number;
    outstanding_total: number;
    by_employee: AdvancesReportEmployeeGroup[];
    details: AdvancesReportDetail[];
}

export interface Expense {
    id: number;
    work_day_id: number | null;
    /** 'YYYY-MM-DD' — the caisse day this expense is actually reported under. */
    work_day_date: string | null;
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

export interface UpdateExpensePayload {
    label?: string;
    category?: string;
    amount?: number;
    /** 'YYYY-MM-DD' */
    spent_on?: string;
    /** Re-attributes the expense to a different caisse day. */
    work_day_id?: number | null;
}

export interface EmployeeAccount {
    user_id: number;
    login_email: string;
    system_role: 'admin' | 'employee' | 'super-admin' | null;
    is_account_active: boolean;
}

export interface Employee {
    id: number;
    name: string;
    role: string;
    email: string | null;
    phone: string | null;
    avatar_color: string;
    specialties: string[];
    /** Service catalog categories this employee performs — empty means no restriction. */
    service_categories: string[];
    /** Precise service allow-list, narrower than service_categories — empty means no restriction. */
    allowed_service_ids: number[];
    is_active: boolean;
    default_commission_rate: number | null;
    account?: EmployeeAccount | null;
}

export interface EmployeePayload {
    name?: string;
    role?: string;
    email?: string | null;
    phone?: string | null;
    avatar_color?: string;
    specialties?: string[];
    service_categories?: string[];
    allowed_service_ids?: number[];
    is_active?: boolean;
    default_commission_rate?: number | null;
    login_email?: string | null;
    login_password?: string | null;
    system_role?: 'admin' | 'employee' | null;
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
    client_ids?: number[];
    clients?: Array<{ id: number; name: string; phone: string | null }>;
    employee_id: number | null;
    service_id: number;
    starts_at: string;
    ends_at: string;
    status: AppointmentStatus;
    notes: string | null;
    duration_minutes?: number;
    duration_override_minutes?: number | null;
    reservation_items?: ReservationItem[];
    services?: Array<{
        id: number;
        name: string;
        category: string;
        duration_minutes: number;
        price: number;
        color: string;
    }>;
    employees?: Array<{ id: number; name: string; avatar_color: string }>;
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

export interface ReservationItem {
    service_id: number;
    employee_id: number | null;
    service: {
        id: number;
        name: string;
        duration_minutes: number;
        price: number;
        color: string;
    } | null;
    employee: { id: number; name: string; avatar_color: string } | null;
}

export interface AppointmentPayload {
    client_id?: number;
    client_ids?: number[];
    employee_id?: number | null;
    service_id?: number;
    starts_at?: string;
    status?: AppointmentStatus;
    notes?: string | null;
    items?: Array<{ service_id: number; employee_id: number | null }>;
    /** Manual length override in minutes, set by dragging an event's edge on the calendar. */
    duration_override_minutes?: number | null;
}
