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
}

export interface TopPrestation {
    label: string;
    count: number;
    total: number;
}

export interface ClosingReport {
    revenue_total: number;
    expenses_total: number;
    advances_total: number;
    commissions_total: number;
    net_result: number;
    clients_count: number;
    average_ticket: number;
    revenue_by_category: RevenueByCategory[];
    revenue_by_employee: RevenueByEmployee[];
    top_prestations: TopPrestation[];
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
    closing_report: ClosingReport | null;
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
    phone: string | null;
    loyalty_points: number;
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
    price: number;
    cost: number;
    stock_quantity: number;
    low_stock_threshold: number;
}

export interface ProductPayload {
    name?: string;
    sku?: string | null;
    category?: string;
    price?: number;
    cost?: number | null;
    stock_quantity?: number;
    low_stock_threshold?: number;
}
