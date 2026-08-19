import type { Partner, PartnerStatus } from '@/types/workday';

export type { PartnerStatus };

export interface PartnerDashboard {
    partner_name: string;
    status: PartnerStatus;
    reservations_month: number;
    reservations_confirmed: number;
    commission_estimated: number;
    commission_validated: number;
    commission_paid: number;
}

export interface PartnerBookableService {
    service_id: number;
    name: string;
    category: string | null;
    duration_minutes: number;
    price: number;
    color: string | null;
    commission_type: 'percentage' | 'fixed' | null;
    commission_value: number;
    commission_preview: number;
}

export interface PartnerClientRow {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    avatar_color: string;
    created_at: string | null;
    reservations_count: number;
    last_reservation_at: string | null;
    revenue_generated: number;
    commission_generated: number;
}

export interface PartnerClientReservationRow {
    id: number;
    starts_at: string | null;
    status: string;
    service_name: string | null;
}

export interface PartnerClientDetail extends PartnerClientRow {
    reservations: PartnerClientReservationRow[];
}

export type PartnerCommissionStatus = 'validated' | 'paid' | 'cancelled';

export interface PartnerCommissionRow {
    id: number;
    client_id: number | null;
    client_name: string | null;
    service_name: string | null;
    prestation_reference: string | null;
    base_amount: number;
    type: 'percentage' | 'fixed' | null;
    rate_or_amount: number | null;
    amount: number;
    status: PartnerCommissionStatus;
    created_at: string | null;
    paid_at: string | null;
}

export interface PartnerCommissionsResponse {
    data: PartnerCommissionRow[];
    meta: {
        estimated_total: number;
        validated_total: number;
        paid_total: number;
    };
}

/** The sensitive, single-partner view — payment info included. Never returned by a list endpoint. */
export interface PartnerProfile extends Partner {
    legal_name: string | null;
    ice: string | null;
    payment_holder_name: string | null;
    payment_bank_name: string | null;
    payment_iban: string | null;
    payment_method_preference: string | null;
}

export interface PartnerProfilePayload {
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    trade_name?: string | null;
    legal_name?: string | null;
    ice?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    payment_holder_name?: string | null;
    payment_bank_name?: string | null;
    payment_iban?: string | null;
    payment_method_preference?: string | null;
    login_email?: string;
}

/** Admin side: what BOGOSLAND sees on a partner's full fiche (§19). */
export interface PartnerPerformance {
    clients_count: number;
    appointments_count: number;
    appointments_confirmed_count: number;
    revenue_generated: number;
    commission_total: number;
    commission_due: number;
}

export interface PartnerDetail extends PartnerProfile {
    performance: PartnerPerformance;
}

/** Admin side: due-commission rows for the payout screen (§21). */
export interface AdminPartnerCommissionRow {
    id: number;
    partner_id: number;
    partner_name: string | null;
    client_name: string | null;
    service_name: string | null;
    base_amount: number;
    amount: number;
    created_at: string | null;
}

export interface AdminPartnerCommissionsResponse {
    data: AdminPartnerCommissionRow[];
    meta: {
        total_due: number;
        by_partner: Array<{ partner_id: number; partner_name: string | null; total: number; count: number }>;
    };
}

export interface PartnerCommissionPayoutPayload {
    partner_id: number;
    commission_ids?: number[] | null;
    payment_method?: string | null;
    reference?: string | null;
    notes?: string | null;
}

export interface PartnerCommissionPayoutResult {
    id: number;
    partner_id: number;
    amount: number;
    payment_method: string | null;
    reference: string | null;
    paid_at: string;
    paid_by: string;
    notes: string | null;
    commissions_count: number;
}

/** §23-25 — support chat, shared shape between the partner side and the admin inbox. */
export type SupportConversationStatus = 'nouveau' | 'en_cours' | 'en_attente_partenaire' | 'resolu' | 'ferme';

export interface SupportConversationSummary {
    id: number;
    partner_id: number;
    partner_name: string | null;
    subject: string | null;
    status: SupportConversationStatus;
    last_message_preview: string | null;
    last_message_at: string | null;
    unread: boolean;
}

export interface SupportMessageRow {
    id: number;
    body: string;
    author: string | null;
    is_staff: boolean;
    created_at: string | null;
}

export interface SupportConversationDetail {
    id: number;
    partner_id: number;
    partner_name: string | null;
    subject: string | null;
    status: SupportConversationStatus;
    messages: SupportMessageRow[];
}
