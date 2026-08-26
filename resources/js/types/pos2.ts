/**
 * Caisse V2 (POS) — types mirroring app/Http/Resources/PosV2/* and the
 * /api/pos-v2/* endpoints. Kept separate from types/workday.ts so V1's
 * types never need to change.
 */

export type Pos2InvoiceStatus =
    | 'draft'
    | 'in_progress'
    | 'services_done'
    | 'pending_payment'
    | 'paid'
    | 'cancelled'
    | 'refunded';

export type Pos2PaymentMethod = 'especes' | 'carte' | 'virement' | 'mixte' | 'autre';
export type Pos2TenderMethod = 'especes' | 'carte' | 'virement' | 'autre';

export interface Pos2BreakdownRow {
    method: Pos2TenderMethod;
    amount: number;
}

export interface Pos2InvoiceLine {
    id: number;
    service_id: number | null;
    service_name: string | null;
    /** Ligne produit (vente vitrine/réfrigérateur) — stock décrémenté à l'encaissement. */
    product_id?: number | null;
    category: string | null;
    /** Does this line's service require a responsible employee? false for free-text and product lines. */
    requires_employee?: boolean;
    label: string;
    quantity: number;
    unit_price: number;
    discount_amount: number | null;
    discount_reason: string | null;
    line_total: number;
    effective_line_total: number;
    employee_id: number | null;
    employee_name: string | null;
    employee_avatar_color: string | null;
    beneficiary_name: string | null;
    duration_minutes: number | null;
    notes: string | null;
    is_free: boolean;
    public_price: number | null;
    client_subscription_id: number | null;
    loyalty_reward_id: number | null;
    commission_amount: number | null;
    /** Backend preview (CommissionResolver) while the invoice is open; commission_amount is the frozen value once paid. */
    estimated_commission?: number | null;
}

export interface Pos2Tip {
    id: number;
    employee_id: number;
    employee_name: string | null;
    prestation_item_id: number | null;
    amount: number;
    payment_method: string | null;
    voided?: boolean;
}

export interface Pos2Commission {
    id: number;
    prestation_item_id: number;
    tip_id: number | null;
    employee_id: number;
    employee_name: string | null;
    service_id: number | null;
    type: string;
    rate_or_amount: number;
    base_amount: number;
    amount: number;
    status: string;
}

export interface Pos2InvoiceEmployee {
    id: number;
    name: string;
    avatar_color: string;
}

export interface Pos2StatusLog {
    from_status: string | null;
    to_status: string;
    user_name: string | null;
    reason: string | null;
    created_at: string;
}

export interface Pos2Invoice {
    id: number;
    reference: string;
    status: Pos2InvoiceStatus;
    channel: string | null;
    held: boolean;
    held_at: string | null;
    work_day_id: number | null;
    appointment_id: number | null;
    client_id: number | null;
    client_name: string | null;
    client_phone: string | null;
    client_avatar_color: string | null;
    is_walk_in: boolean;
    employee_id: number | null;
    employee_name?: string | null;
    subtotal: number;
    line_discounts_total?: number;
    discount_amount: number | null;
    discount_reason: string | null;
    total: number;
    payment_method: string | null;
    payment_breakdown: Pos2BreakdownRow[] | null;
    amount_received: number | null;
    change_given: number | null;
    notes: string | null;
    created_at: string;
    opened_time: string | null;
    confirmed_at: string | null;
    confirmed_by?: string | null;
    created_by?: string | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
    refunded_at: string | null;
    refund_reason: string | null;
    sale_id: number | null;
    sale_deleted?: boolean;
    print_count: number;
    items_count?: number;
    items?: Pos2InvoiceLine[];
    employees?: Pos2InvoiceEmployee[];
    tips?: Pos2Tip[];
    tips_total?: number;
    commissions?: Pos2Commission[];
    status_logs?: Pos2StatusLog[];
}

export interface Pos2Dashboard {
    work_day: {
        id: number;
        date: string | null;
        opening_balance: number;
        opened_by: string | null;
    } | null;
    open_invoices_count: number;
    open_invoices_total: number;
    revenue_total: number;
    ticket_count: number;
    v2_ticket_count: number;
    payment_methods: Array<{ method: string; count: number; total: number }>;
    tips_total: number;
    subscription_payments_total: number;
}

export interface Pos2SubscriptionServiceInfo {
    subscription_plan_service_id: number;
    service_id: number | null;
    service_name: string | null;
    public_price: number | null;
    period_remaining: number | null;
    total_remaining: number | null;
    unlimited: boolean;
}

export interface Pos2SubscriptionInfo {
    id: number;
    plan_id: number;
    plan_name: string | null;
    starts_on: string | null;
    ends_on: string | null;
    usable: boolean;
    block_reason: string | null;
    rules: {
        allowed_days: number[];
        day_allowed: boolean;
        time_start: string | null;
        time_end: string | null;
        time_allowed: boolean;
        min_interval_minutes: number | null;
        interval_ok: boolean;
        next_allowed_at: string | null;
        caps: Record<string, { limit: number | null; count: number; reached: boolean }>;
    };
    payment: { total: number | null; paid: number; remaining: number | null };
    services: Pos2SubscriptionServiceInfo[];
}

export interface Pos2RewardInfo {
    id: number;
    program_name: string | null;
    type: string;
    service_id: number | null;
    service_name: string | null;
    value: number | null;
    expires_at: string | null;
}

export interface Pos2ClientContext {
    client: {
        id: number;
        name: string;
        phone: string | null;
        avatar_color: string | null;
        notes: string | null;
        last_visit_at: string | null;
    };
    points_balance: number;
    rewards: Pos2RewardInfo[];
    subscriptions: Pos2SubscriptionInfo[];
}

export interface Pos2SubscriptionPaymentStatus {
    total: number | null;
    paid: number;
    remaining: number | null;
    payments: Array<{
        id: number;
        amount: number;
        payment_method: string;
        collected_by: string | null;
        notes: string | null;
        voided: boolean;
        created_at: string | null;
    }>;
}

export interface Pos2QrLookupResult {
    type: 'client' | 'subscription';
    client: { id: number | null; name: string | null; phone: string | null; avatar_color: string | null };
    client_subscription_id?: number;
    plan_name?: string | null;
    status?: string;
}

/** Prestation envoyée en caisse par un employé (workflow V1, statut pending_payment). */
export interface Pos2PendingPrestation {
    id: number;
    reference: string;
    client_id: number | null;
    client_name: string;
    employee_id: number | null;
    employee_name: string | null;
    employee_avatar_color: string | null;
    items_count: number;
    services_label: string;
    total: number;
    sent_at: string | null;
    sent_time: string | null;
}

export interface Pos2TodayAppointment {
    id: number;
    client_id: number | null;
    client_name: string;
    client_phone: string | null;
    starts_at: string | null;
    time: string | null;
    status: string;
    people_count: number;
    services_count: number;
    services_label: string;
    estimated_total: number;
    invoice_id: number | null;
    invoice_reference: string | null;
    invoice_status: string | null;
}

export interface Pos2LinePayload {
    service_id?: number | null;
    product_id?: number | null;
    label?: string | null;
    quantity?: number;
    unit_price?: number | null;
    employee_id?: number | null;
    beneficiary_name?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
    loyalty_reward_id?: number | null;
    client_subscription_id?: number | null;
    subscription_plan_service_id?: number | null;
    exception_override?: boolean;
    override_reason?: string | null;
}

export interface Pos2TipPayload {
    employee_id: number;
    amount: number;
    prestation_item_id?: number | null;
    payment_method?: Pos2TenderMethod | null;
    notes?: string | null;
}

export interface Pos2CheckoutPayload {
    payment_method: Pos2PaymentMethod;
    payment_breakdown?: Pos2BreakdownRow[];
    amount_received?: number | null;
    discount_amount?: number | null;
    discount_reason?: string | null;
    expected_total?: number;
    tips?: Pos2TipPayload[];
}

export interface Pos2HistoryFilters {
    from?: string;
    to?: string;
    time_from?: string;
    time_to?: string;
    status?: string;
    payment_method?: string;
    service_id?: number;
    category?: string;
    employee_id?: number;
    client_id?: number;
    work_day_id?: number;
    subscription?: boolean;
    search?: string;
    page?: number;
    per_page?: number;
}

export interface Pos2HistoryResponse {
    data: Pos2Invoice[];
    meta: {
        current_page: number;
        last_page: number;
        total: number;
        page_paid_total: number;
        page_paid_count: number;
        stats: {
            paid_count: number;
            paid_total: number;
            v1_count: number;
            v2_count: number;
            employees: Array<{
                employee_id: number;
                employee_name: string;
                performed_count: number;
                invoices_count: number;
                total: number;
                commission_total: number;
            }>;
        };
    };
}
