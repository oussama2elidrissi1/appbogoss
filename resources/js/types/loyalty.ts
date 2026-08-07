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
    notes: string | null;
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
    notes?: string | null;
    services: SubscriptionPlanServicePayload[];
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

export interface LoyaltyQrSettings {
    enabled: boolean;
    message: string | null;
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
