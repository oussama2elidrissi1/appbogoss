export type LoyaltyProgramType =
    | 'service_count'
    | 'points'
    | 'amount_spent'
    | 'visit_count'
    | 'birthday'
    | 'custom';

export type CommissionBasis = 'none' | 'public_price' | 'fixed' | 'percent' | 'internal_value';

export interface LoyaltyProgramConfig {
    service_id?: number | null;
    category?: string | null;
    threshold?: number;
    points_per_mad?: number;
    rollover_surplus?: boolean;
    reward_expires_after_days?: number | null;
    count_free_lines?: boolean;
    reward?: {
        type: 'service' | 'discount_percent' | 'discount_amount';
        service_id?: number | null;
        value?: number | null;
    };
    conditions?: Array<{ metric: string; value: number | boolean }>;
    [key: string]: unknown;
}

export interface LoyaltyProgram {
    id: number;
    name: string;
    description: string | null;
    type: LoyaltyProgramType;
    is_active: boolean;
    config: LoyaltyProgramConfig;
    commission_basis: CommissionBasis | null;
    commission_value: number | null;
    starts_on: string | null;
    ends_on: string | null;
    notes: string | null;
    created_at: string;
}

export interface LoyaltyProgramPayload {
    name: string;
    description?: string | null;
    type: LoyaltyProgramType;
    is_active?: boolean;
    config: LoyaltyProgramConfig;
    commission_basis?: CommissionBasis;
    commission_value?: number | null;
    starts_on?: string | null;
    ends_on?: string | null;
    notes?: string | null;
}

export interface SubscriptionPlanServiceRow {
    id: number;
    service_id: number;
    service_name: string;
    quota_period: 'day' | 'week' | 'month' | null;
    quota_per_period: number | null;
    quota_total: number | null;
    allow_rollover: boolean;
    commission_basis: CommissionBasis | null;
    commission_value: number | null;
}

export interface SubscriptionPlan {
    id: number;
    name: string;
    description: string | null;
    price: number;
    duration_value: number;
    duration_unit: 'days' | 'weeks' | 'months';
    is_active: boolean;
    allow_suspension?: boolean;
    allow_renewal?: boolean;
    notes: string | null;
    /** ISO weekdays (1=lundi … 7=dimanche); empty = every day. */
    allowed_days?: number[];
    time_start?: string | null;
    time_end?: string | null;
    max_per_day?: number | null;
    max_per_week?: number | null;
    max_per_month?: number | null;
    min_interval_minutes?: number | null;
    active_subscriptions_count?: number | null;
    services: SubscriptionPlanServiceRow[];
}

export interface SubscriptionPlanServicePayload {
    service_id: number;
    quota_period?: 'day' | 'week' | 'month' | null;
    quota_per_period?: number | null;
    quota_total?: number | null;
    allow_rollover?: boolean;
    commission_basis?: CommissionBasis;
    commission_value?: number | null;
}

export interface SubscriptionPlanPayload {
    name: string;
    description?: string | null;
    price: number;
    duration_value: number;
    duration_unit: 'days' | 'weeks' | 'months';
    is_active?: boolean;
    allow_suspension?: boolean;
    allow_renewal?: boolean;
    notes?: string | null;
    allowed_days?: number[] | null;
    time_start?: string | null;
    time_end?: string | null;
    max_per_day?: number | null;
    max_per_week?: number | null;
    max_per_month?: number | null;
    min_interval_minutes?: number | null;
    services: SubscriptionPlanServicePayload[];
}

/* ------------------------------------------------------------------ */
/* Sold subscriptions (admin module)                                   */
/* ------------------------------------------------------------------ */

export type AdminSubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'suspended';

export interface AdminSubscription {
    id: number;
    status: AdminSubscriptionStatus;
    client: { id: number | null; name: string; phone: string | null };
    plan: {
        id: number | null;
        name: string;
        price: number;
        allow_suspension: boolean;
        allow_renewal: boolean;
    };
    price_paid: number;
    /** True when the purchase ticket has been voided from the caisse. */
    sale_refunded: boolean;
    purchased_at: string | null;
    starts_on: string;
    ends_on: string;
    suspension_starts_on: string | null;
    suspension_ends_on: string | null;
    cancel_reason: string | null;
    renewed_from_id: number | null;
    qr_token: string | null;
    used_visits: number;
    total_visits: number | null;
    services: Array<{
        plan_service_id: number;
        service_name: string;
        quota_period: string | null;
        quota_per_period: number | null;
        quota_total: number | null;
    }>;
}

export interface SubscriptionUsageRow {
    id: number;
    used_at: string | null;
    used_on: string | null;
    client_name: string | null;
    plan_name: string | null;
    service_name: string | null;
    employee_name: string | null;
    validated_by: string | null;
    status: 'reserved' | 'confirmed' | 'voided';
    channel: string | null;
    exception_override: boolean;
}

export interface SubscriptionsDashboard {
    active_count: number;
    sold_this_month: number;
    revenue_this_month: number;
    expiring_soon_count: number;
    expiring_soon: Array<{ id: number; client_name: string | null; plan_name: string | null; ends_on: string }>;
    visits_today: number;
    visits_this_month: number;
    top_plans: Array<{ plan_name: string; count: number }>;
    top_services: Array<{ service_name: string; count: number }>;
}

/* ------------------------------------------------------------------ */
/* Scanner                                                             */
/* ------------------------------------------------------------------ */

export interface ScanCardService {
    plan_service_id: number;
    service_id: number;
    name: string;
    price: number;
    duration_minutes: number | null;
    quota_period: string | null;
    quota_per_period: number | null;
    period_remaining: number | null;
    quota_total: number | null;
    total_remaining: number | null;
    unlimited: boolean;
}

export interface ScanCardRules {
    allowed_days: number[];
    day_allowed: boolean;
    time_start: string | null;
    time_end: string | null;
    time_allowed: boolean;
    min_interval_minutes: number | null;
    interval_ok: boolean;
    next_allowed_at: string | null;
    caps: Record<'day' | 'week' | 'month', { limit: number | null; count: number; reached: boolean }>;
}

export interface SubscriptionScanCard {
    subscription: {
        id: number;
        status: AdminSubscriptionStatus;
        starts_on: string;
        ends_on: string;
        purchased_at: string | null;
        suspension_ends_on: string | null;
        renewable: boolean;
    };
    plan: { id: number | null; name: string; description: string | null; price: number };
    client: { id: number | null; name: string; phone: string | null; avatar_color: string | null };
    usable: boolean;
    block_reason: string | null;
    rules: ScanCardRules;
    used_visits: number;
    total_visits: number | null;
    services: ScanCardService[];
    recent_usages: Array<{
        used_at: string | null;
        service_name: string;
        employee_name: string | null;
        channel: string | null;
        status: string;
    }>;
}

export interface ValidateVisitResponse {
    validated: boolean;
    prestation_id: number;
    sale_id: number | null;
    service_name: string | null;
    remaining: { period_remaining: number | null; total_remaining: number | null };
    card: SubscriptionScanCard;
}

export interface ClientSubscription {
    id: number;
    client_id: number;
    client_name: string | null;
    subscription_plan_id: number;
    plan_name: string | null;
    status: 'active' | 'expired' | 'cancelled';
    purchased_at: string;
    starts_on: string;
    ends_on: string;
    sale_id: number | null;
}

export interface PurchaseSubscriptionPayload {
    subscription_plan_id: number;
    payment_method?: string;
    starts_on?: string;
}

export interface ClientLoyaltyReward {
    id: number;
    program_name: string | null;
    type: string;
    service_id: number | null;
    service_name: string | null;
    value: number | null;
    expires_at: string | null;
}

export interface ClientLoyaltySubscriptionService {
    subscription_plan_service_id: number;
    service_id: number;
    service_name: string | null;
    period_remaining: number | null;
    total_remaining: number | null;
}

export interface ClientLoyaltySubscription {
    id: number;
    plan_id: number;
    plan_name: string | null;
    ends_on: string | null;
    services: ClientLoyaltySubscriptionService[];
}

export interface ClientLoyaltyStatus {
    client_id: number;
    points_balance: number;
    rewards: ClientLoyaltyReward[];
    subscriptions: ClientLoyaltySubscription[];
}

export type LoyaltyQrPosterLanguage = 'fr' | 'ar' | 'both';

export interface LoyaltyQrSettings {
    enabled: boolean;
    message: string | null;
    poster_language: LoyaltyQrPosterLanguage;
    token: string;
    join_path: string;
}

export interface LoyaltyNotificationEventSetting {
    enabled?: boolean;
    channels?: string[];
    template?: string;
}

export interface LoyaltySettings {
    loyalty_enabled: boolean;
    loyalty_number_prefix: string;
    loyalty_timezone: string;
    loyalty_qr_registration_enabled: boolean;
    loyalty_qr_message: string;
    loyalty_qr_poster_language: LoyaltyQrPosterLanguage;
    loyalty_qr_token: string | null;
    loyalty_personal_qr_enabled: boolean;
    otp_provider: string;
    otp_ttl_seconds: number;
    otp_max_attempts: number;
    otp_resend_cooldown_seconds: number;
    otp_max_sends_per_hour: number;
    loyalty_reward_default_expiry_days: number;
    loyalty_reward_refund_behavior: string;
    subscription_expiry_alert_days: number;
    subscription_allow_suspension_default: boolean;
    subscription_allow_renewal_default: boolean;
    loyalty_notification_settings: Record<string, LoyaltyNotificationEventSetting> | null;
    notification_events: Record<string, string>;
}
