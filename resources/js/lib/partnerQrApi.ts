import { api } from '@/lib/api';

/**
 * Le QR partenaire, côté navigateur.
 *
 * Deux surfaces bien séparées, et c'est volontaire :
 *
 *  - les appels PUBLICS ne portent JAMAIS d'identifiant de partenaire. Le
 *    partenaire est le jeton dans l'URL, résolu par le serveur. Il n'y a donc
 *    rien à falsifier ici, même en modifiant le code de la page ;
 *  - les appels d'ADMINISTRATION portent l'identifiant du partenaire, et sont
 *    gardés par `permission:partners.manage` côté serveur.
 */

// ----------------------------------------------------------------- public

export interface LandingOffering {
    id: number;
    kind: 'service' | 'pack';
    title: string;
    description: string | null;
    image_url: string | null;
    price: number;
    compare_at_price: number | null;
    duration_minutes: number;
    is_featured: boolean;
    includes: Array<{ name: string; quantity: number }>;
    category: string | null;
}

export interface LandingPayload {
    partner: { display_name: string };
    landing: {
        title: string;
        subtitle: string;
        intro: string;
        cover_image_url: string | null;
    };
    visit_id: number;
    offerings: LandingOffering[];
}

export interface LandingSlot {
    starts_at: string;
    time: string;
    available: boolean;
    employee_ids: number[];
}

export interface LandingAvailability {
    date: string;
    open: boolean;
    slots: LandingSlot[];
    employees: Array<{ id: number; name: string; role: string; avatar_color: string }>;
}

/**
 * Identifiant de session du visiteur — tiré au sort dans l'onglet, jamais
 * envoyé ailleurs. Il ne sert qu'à ne pas compter un rafraîchissement comme
 * un second scan, et le serveur ne le stocke que haché.
 */
export function visitorSessionId(): string {
    const key = 'bogosland.qr-sid';
    try {
        const existing = window.sessionStorage.getItem(key);
        if (existing) return existing;
        const fresh = Math.random().toString(36).slice(2) + Date.now().toString(36);
        window.sessionStorage.setItem(key, fresh);
        return fresh;
    } catch {
        // Stockage bloqué : la visite comptera via l'empreinte serveur.
        return '';
    }
}

export async function getLanding(token: string): Promise<LandingPayload> {
    const { data } = await api.get<{ data: LandingPayload }>(`/api/public/p/${token}`, {
        params: { sid: visitorSessionId() || undefined },
    });
    return data.data;
}

export async function getLandingAvailability(
    token: string,
    offeringId: number,
    date: string,
): Promise<LandingAvailability> {
    const { data } = await api.get<{ data: LandingAvailability }>(`/api/public/p/${token}/availability`, {
        params: { offering_id: offeringId, date },
    });
    return data.data;
}

export interface LandingBookingResult {
    reference: number;
    starts_at: string | null;
    status: string;
    offering_title: string;
    price: number;
    message: string;
}

export async function bookLandingOffer(
    token: string,
    payload: {
        offering_id: number;
        starts_at: string;
        name: string;
        phone: string;
        email?: string | null;
        note?: string | null;
    },
): Promise<LandingBookingResult> {
    const { data } = await api.post<{ data: LandingBookingResult }>(`/api/public/p/${token}/reservations`, {
        ...payload,
        sid: visitorSessionId() || undefined,
    });
    return data.data;
}

// ------------------------------------------------------------------ admin

export interface PartnerQrToken {
    token: string;
    url: string;
    issued_at: string | null;
}

export interface PartnerQrStats {
    visits: number;
    bookings: number;
    confirmed_bookings: number;
    revenue_total: number;
    commission_total: number;
    conversion_rate: number;
}

export interface PartnerOffering {
    id: number;
    kind: 'service' | 'pack';
    service_id: number | null;
    service_pack_id: number | null;
    catalog_name: string | null;
    catalog_price: number | null;
    title: string;
    effective_price: number;
    duration_minutes: number;
    is_active: boolean;
    is_featured: boolean;
    sort_order: number;
    custom_price: number | null;
    custom_commission_type: 'percentage' | 'fixed' | null;
    custom_commission_value: number | null;
    custom_title: string | null;
    custom_description: string | null;
    available_from: string | null;
    available_until: string | null;
}

export interface PartnerLandingSettings {
    is_enabled: boolean;
    title: string | null;
    subtitle: string | null;
    intro: string | null;
    cover_image_url: string | null;
}

export interface QrBookingRow {
    id: number;
    starts_at: string | null;
    status: string;
    client_name: string | null;
    service_name: string | null;
    offering_id?: number | null;
    total?: number;
    estimated_total?: number;
    commission_earned?: number;
}

export interface OfferingCatalog {
    services: Array<{ id: number; name: string; category: string; price: number; duration_minutes: number }>;
    packs: Array<{ id: number; name: string; price: number; effective_price: number; duration_minutes: number }>;
}

export async function getPartnerQrToken(partnerId: number): Promise<PartnerQrToken> {
    const { data } = await api.get<{ data: PartnerQrToken }>(`/api/partners/${partnerId}/qr/token`);
    return data.data;
}

export async function regeneratePartnerQrToken(partnerId: number): Promise<PartnerQrToken> {
    const { data } = await api.post<{ data: PartnerQrToken }>(`/api/partners/${partnerId}/qr/token/regenerate`);
    return data.data;
}

export async function revokePartnerQrToken(partnerId: number): Promise<void> {
    await api.delete(`/api/partners/${partnerId}/qr/token`);
}

export async function getPartnerQrStats(partnerId: number): Promise<PartnerQrStats> {
    const { data } = await api.get<{ data: PartnerQrStats }>(`/api/partners/${partnerId}/qr/stats`);
    return data.data;
}

export async function getPartnerQrBookings(partnerId: number): Promise<QrBookingRow[]> {
    const { data } = await api.get<{ data: QrBookingRow[] }>(`/api/partners/${partnerId}/qr/bookings`);
    return data.data;
}

export async function getPartnerOfferings(partnerId: number): Promise<PartnerOffering[]> {
    const { data } = await api.get<{ data: PartnerOffering[] }>(`/api/partners/${partnerId}/qr/offerings`);
    return data.data;
}

export async function createPartnerOffering(
    partnerId: number,
    payload: Record<string, unknown>,
): Promise<PartnerOffering> {
    const { data } = await api.post<{ data: PartnerOffering }>(`/api/partners/${partnerId}/qr/offerings`, payload);
    return data.data;
}

export async function updatePartnerOffering(
    partnerId: number,
    offeringId: number,
    payload: Record<string, unknown>,
): Promise<PartnerOffering> {
    const { data } = await api.patch<{ data: PartnerOffering }>(
        `/api/partners/${partnerId}/qr/offerings/${offeringId}`,
        payload,
    );
    return data.data;
}

export async function deletePartnerOffering(partnerId: number, offeringId: number): Promise<void> {
    await api.delete(`/api/partners/${partnerId}/qr/offerings/${offeringId}`);
}

export async function reorderPartnerOfferings(partnerId: number, ids: number[]): Promise<void> {
    await api.post(`/api/partners/${partnerId}/qr/offerings/reorder`, { ids });
}

export async function getPartnerLandingSettings(partnerId: number): Promise<PartnerLandingSettings> {
    const { data } = await api.get<{ data: PartnerLandingSettings }>(`/api/partners/${partnerId}/qr/landing`);
    return data.data;
}

export async function updatePartnerLandingSettings(
    partnerId: number,
    payload: Partial<PartnerLandingSettings>,
): Promise<PartnerLandingSettings> {
    const { data } = await api.patch<{ data: PartnerLandingSettings }>(
        `/api/partners/${partnerId}/qr/landing`,
        payload,
    );
    return data.data;
}

export async function getOfferingCatalog(): Promise<OfferingCatalog> {
    const { data } = await api.get<{ data: OfferingCatalog }>('/api/partner-qr/catalog');
    return data.data;
}

// ------------------------------------------------------------------ packs

export interface ServicePackItem {
    id: number;
    service_id: number;
    service_name: string | null;
    service_price: number | null;
    quantity: number;
}

export interface ServicePack {
    id: number;
    name: string;
    description: string | null;
    image_url: string | null;
    price: number;
    promotional_price: number | null;
    effective_price: number;
    duration_minutes: number;
    is_active: boolean;
    sort_order: number;
    items: ServicePackItem[];
}

export async function getServicePacks(includeInactive = true): Promise<ServicePack[]> {
    const { data } = await api.get<{ data: ServicePack[] }>('/api/service-packs', {
        params: includeInactive ? { include_inactive: 1 } : {},
    });
    return data.data;
}

export async function createServicePack(payload: Record<string, unknown>): Promise<ServicePack> {
    const { data } = await api.post<{ data: ServicePack }>('/api/service-packs', payload);
    return data.data;
}

export async function updateServicePack(id: number, payload: Record<string, unknown>): Promise<ServicePack> {
    const { data } = await api.patch<{ data: ServicePack }>(`/api/service-packs/${id}`, payload);
    return data.data;
}

export async function deleteServicePack(id: number): Promise<void> {
    await api.delete(`/api/service-packs/${id}`);
}

// --------------------------------------------------------- portail partenaire

export interface PartnerOwnQr {
    token: string;
    url: string;
    landing_enabled: boolean;
    stats: PartnerQrStats;
}

export async function getOwnPartnerQr(): Promise<PartnerOwnQr> {
    const { data } = await api.get<{ data: PartnerOwnQr }>('/api/partner/qr');
    return data.data;
}

export async function getOwnPartnerQrBookings(): Promise<QrBookingRow[]> {
    const { data } = await api.get<{ data: QrBookingRow[] }>('/api/partner/qr/bookings');
    return data.data;
}
