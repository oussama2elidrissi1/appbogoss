export interface PortalClient {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    birth_date: string | null;
    gender: 'female' | 'male' | 'other' | null;
    marketing_consent: boolean;
    loyalty_number: string | null;
    points_balance: number;
    registered_at: string | null;
}

export interface PortalProgramProgress {
    program_id: number;
    name: string;
    description: string | null;
    type: string;
    current: number;
    threshold: number | null;
    percent: number | null;
    remaining: number | null;
}

export interface PortalSubscriptionServiceQuota {
    service_name: string | null;
    quota_period: 'day' | 'week' | 'month' | null;
    quota_per_period: number | null;
    period_remaining: number | null;
    quota_total: number | null;
    total_remaining: number | null;
}

export interface PortalSubscription {
    id: number;
    plan_name: string | null;
    price: number | null;
    status: 'active' | 'expired' | 'cancelled' | 'suspended';
    starts_on: string | null;
    ends_on: string | null;
    suspension_starts_on: string | null;
    suspension_ends_on: string | null;
    renewable: boolean;
    services: PortalSubscriptionServiceQuota[];
}

export interface PortalHomeAlert {
    type: 'reward_expiring' | 'subscription_expiring';
    message: string;
}

export interface PortalHome {
    name: string;
    points_balance: number;
    rewards_available: number;
    active_subscriptions: number;
    visits_count: number;
    next_reward: PortalProgramProgress | null;
    subscriptions: PortalSubscription[];
    alerts: PortalHomeAlert[];
}

export interface PortalReward {
    id: number;
    program_name: string | null;
    type: string;
    service_name: string | null;
    value: number | null;
    status: 'available' | 'reserved' | 'used' | 'expired' | 'cancelled';
    generated_at: string | null;
    expires_at: string | null;
    used_at: string | null;
}

export interface PortalRewardsResponse {
    available: PortalReward[];
    used: PortalReward[];
    expired: PortalReward[];
}
