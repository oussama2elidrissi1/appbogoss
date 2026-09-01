export type PrestationStatus =
    | 'draft'
    | 'in_progress'
    | 'services_done'
    | 'pending_payment'
    | 'paid'
    | 'cancelled'
    | 'refunded';

export interface PrestationItem {
    id: number;
    service_id: number | null;
    label: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    duration_minutes: number | null;
    notes: string | null;
    commission_type: string | null;
    commission_value: number | null;
    commission_amount: number | null;
    loyalty_reward_id: number | null;
    client_subscription_id: number | null;
    is_free: boolean;
    public_price: number | null;
}

export interface PrestationStatusLogEntry {
    from_status: PrestationStatus | null;
    to_status: PrestationStatus;
    user_name: string | null;
    reason: string | null;
    created_at: string;
}

export interface Prestation {
    id: number;
    reference: string;
    status: PrestationStatus;
    work_day_id: number | null;
    client_id: number | null;
    client_name: string | null;
    client_phone: string | null;
    employee_id: number;
    employee_name: string | null;
    created_by_user_id: number;
    subtotal: number;
    discount_percent: number | null;
    discount_amount: number | null;
    total: number;
    payment_method: string | null;
    payment_breakdown: Record<string, number> | null;
    amount_received: number | null;
    change_given: number | null;
    notes: string | null;
    validated_at: string | null;
    confirmed_at: string | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
    refunded_at: string | null;
    refund_reason: string | null;
    sale_id: number | null;
    print_count: number;
    created_at: string;
    items: PrestationItem[];
    total_commission?: number;
    status_logs?: PrestationStatusLogEntry[];
}

export interface CreatePrestationPayload {
    client_id?: number | null;
    client_label?: string | null;
    notes?: string | null;
    items?: Array<{
        service_id?: number | null;
        label?: string;
        quantity?: number;
        unit_price?: number;
        duration_minutes?: number | null;
        notes?: string | null;
        loyalty_reward_id?: number | null;
        client_subscription_id?: number | null;
        subscription_plan_service_id?: number | null;
        exception_override?: boolean;
        override_reason?: string | null;
    }>;
}

export interface AddPrestationItemPayload {
    service_id?: number | null;
    label?: string;
    quantity?: number;
    unit_price?: number;
    duration_minutes?: number | null;
    notes?: string | null;
    loyalty_reward_id?: number | null;
    client_subscription_id?: number | null;
    subscription_plan_service_id?: number | null;
    exception_override?: boolean;
    override_reason?: string | null;
}

export interface UpdatePrestationItemPayload {
    quantity?: number;
    unit_price?: number;
    notes?: string | null;
}

export type PrestationPaymentMethod = 'especes' | 'carte' | 'virement' | 'mixte' | 'autre';

export interface ConfirmPrestationPaymentPayload {
    payment_method: PrestationPaymentMethod;
    payment_breakdown?: Record<string, number> | null;
    amount_received?: number | null;
    change_given?: number | null;
    discount_amount?: number | null;
}

export interface ActivityLogEntry {
    id: number;
    action: string;
    user_name: string;
    subject_type: string | null;
    subject_id: number | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    ip_address: string | null;
    created_at: string;
}

export interface AppNotification {
    id: string;
    data: {
        type: string;
        message: string;
        [key: string]: unknown;
    };
    read_at: string | null;
    created_at: string;
}

export interface MyDashboard {
    prestations_today_count: number;
    revenue_today: number;
    commission_today: number;
    in_progress_count: number;
    pending_payment_count: number;
    paid_today_count: number;
    commission_week: number;
    commission_month: number;
    recent: Array<{
        id: string;
        reference: string;
        status: PrestationStatus;
        total: number;
        created_at: string;
        is_deleted: boolean;
    }>;
}

export interface MyCommissionRow {
    id: number;
    date: string;
    prestation_reference: string | null;
    service_name: string | null;
    base_amount: number;
    type: string;
    rate_or_amount: number;
    amount: number;
    status: string;
    is_deleted: boolean;
}

export interface CommissionsReport {
    period: { from: string; to: string };
    total: number;
    cancelled_total: number;
    by_employee: Array<{ employee_id: number; employee_name: string; count: number; total: number }>;
    details: Array<{
        id: number;
        date: string;
        employee_name: string;
        service_name: string | null;
        prestation_reference: string | null;
        base_amount: number;
        amount: number;
        status: string;
        is_deleted: boolean;
    }>;
}

export interface MyReport {
    period: { from: string; to: string };
    revenue_total: number;
    commission_total: number;
    prestations_count: number;
    paid_count: number;
    cancelled_count: number;
    clients_count: number;
    average_ticket: number;
    top_services: Array<{ label: string; count: number; total: number }>;
    details: Array<{
        date: string;
        reference: string;
        client: string;
        total: number;
        status: PrestationStatus;
        commission: number;
        is_deleted: boolean;
    }>;
}

export interface CommissionPayoutRow {
    employee_id: number;
    employee_name: string;
    avatar_color: string;
    commission_total: number;
    advances_outstanding: number;
    /** Net already paid out this period, summed over its payouts. */
    paid_net_total: number;
    /** Advances settled by this period's payouts. */
    paid_advances_total: number;
    /**
     * Argent déjà remis en main propre depuis un portefeuille pour ce mois.
     * Il couvre la commission au même titre qu'une paie enregistrée : sans
     * lui, l'écran réclamerait une seconde fois ce qui est déjà sorti.
     */
    paid_from_wallet: number;
    /** Part des avances en cours donnée pendant ce mois. */
    advances_in_period: number;
    /**
     * Part venant de mois précédents, toujours non soldée. Déduite du reste
     * comme les autres, mais versée à l'époque — jamais « ce mois-ci ».
     */
    advances_carried_over: number;
    /** What is STILL owed — a paid employee can earn more in the same month. */
    net_amount: number;
    already_paid: boolean;
    /** Latest payout of the period. */
    payout: {
        id: number;
        net_amount: number;
        paid_at: string;
        paid_by: string | null;
    } | null;
}

export interface CommissionPayout {
    id: number;
    employee_id: number;
    period: string;
    commission_total: number;
    advances_deducted: number;
    net_amount: number;
    paid_at: string;
    paid_by: string | null;
}
