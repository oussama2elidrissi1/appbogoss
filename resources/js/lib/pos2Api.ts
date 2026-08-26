import { api } from '@/lib/api';
import type {
    Pos2CheckoutPayload,
    Pos2ClientContext,
    Pos2Dashboard,
    Pos2HistoryFilters,
    Pos2HistoryResponse,
    Pos2Invoice,
    Pos2LinePayload,
    Pos2PendingPrestation,
    Pos2QrLookupResult,
    Pos2SubscriptionPaymentStatus,
    Pos2TodayAppointment,
} from '@/types/pos2';

/**
 * Caisse V2 API client — same axios instance/envelope conventions as
 * lib/api.ts, kept in its own module so the V1 surface stays untouched.
 */

export const pos2Keys = {
    all: ['pos2'] as const,
    dashboard: ['pos2', 'dashboard'] as const,
    invoices: ['pos2', 'invoices'] as const,
    invoice: (id: number) => ['pos2', 'invoices', id] as const,
    clientContext: (clientId: number) => ['pos2', 'client-context', clientId] as const,
    appointmentsToday: ['pos2', 'appointments-today'] as const,
    pending: ['pos2', 'pending'] as const,
    history: (filters: Pos2HistoryFilters) => ['pos2', 'history', filters] as const,
    subscriptionPayments: (id: number) => ['pos2', 'subscription-payments', id] as const,
};

export async function getPos2Dashboard(): Promise<Pos2Dashboard> {
    const { data } = await api.get<{ data: Pos2Dashboard }>('/api/pos-v2/dashboard');
    return data.data;
}

export async function getPos2OpenInvoices(): Promise<Pos2Invoice[]> {
    const { data } = await api.get<{ data: Pos2Invoice[] }>('/api/pos-v2/invoices');
    return data.data;
}

export async function getPos2Invoice(id: number): Promise<Pos2Invoice> {
    const { data } = await api.get<{ data: Pos2Invoice }>(`/api/pos-v2/invoices/${id}`);
    return data.data;
}

export async function openPos2Invoice(payload: {
    client_id?: number | null;
    client_label?: string | null;
    notes?: string | null;
    items?: Pos2LinePayload[];
}): Promise<Pos2Invoice> {
    const { data } = await api.post<{ data: Pos2Invoice }>('/api/pos-v2/invoices', payload);
    return data.data;
}

export async function updatePos2Invoice(
    id: number,
    payload: {
        client_id?: number | null;
        client_label?: string | null;
        notes?: string | null;
        discount_amount?: number | null;
        discount_reason?: string | null;
    },
): Promise<Pos2Invoice> {
    const { data } = await api.patch<{ data: Pos2Invoice }>(`/api/pos-v2/invoices/${id}`, payload);
    return data.data;
}

export async function holdPos2Invoice(id: number): Promise<Pos2Invoice> {
    const { data } = await api.post<{ data: Pos2Invoice }>(`/api/pos-v2/invoices/${id}/hold`);
    return data.data;
}

export async function resumePos2Invoice(id: number): Promise<Pos2Invoice> {
    const { data } = await api.post<{ data: Pos2Invoice }>(`/api/pos-v2/invoices/${id}/resume`);
    return data.data;
}

export async function addPos2Line(invoiceId: number, payload: Pos2LinePayload): Promise<Pos2Invoice> {
    const { data } = await api.post<{ data: Pos2Invoice }>(`/api/pos-v2/invoices/${invoiceId}/lines`, payload);
    return data.data;
}

export async function updatePos2Line(
    invoiceId: number,
    lineId: number,
    payload: Partial<Pos2LinePayload> & { discount_amount?: number | null; discount_reason?: string | null },
): Promise<Pos2Invoice> {
    const { data } = await api.patch<{ data: Pos2Invoice }>(
        `/api/pos-v2/invoices/${invoiceId}/lines/${lineId}`,
        payload,
    );
    return data.data;
}

export async function removePos2Line(invoiceId: number, lineId: number): Promise<Pos2Invoice> {
    const { data } = await api.delete<{ data: Pos2Invoice }>(`/api/pos-v2/invoices/${invoiceId}/lines/${lineId}`);
    return data.data;
}

export async function cancelPos2Invoice(id: number, reason?: string | null): Promise<Pos2Invoice> {
    const { data } = await api.post<{ data: Pos2Invoice }>(`/api/pos-v2/invoices/${id}/cancel`, { reason });
    return data.data;
}

export async function checkoutPos2Invoice(id: number, payload: Pos2CheckoutPayload): Promise<Pos2Invoice> {
    const { data } = await api.post<{ data: Pos2Invoice }>(`/api/pos-v2/invoices/${id}/checkout`, payload);
    return data.data;
}

export async function refundPos2Invoice(id: number, reason: string): Promise<Pos2Invoice> {
    const { data } = await api.post<{ data: Pos2Invoice }>(`/api/pos-v2/invoices/${id}/refund`, { reason });
    return data.data;
}

export async function recordPos2Print(id: number): Promise<number> {
    const { data } = await api.post<{ data: { print_count: number } }>(`/api/pos-v2/invoices/${id}/print`);
    return data.data.print_count;
}

export async function getPos2ClientContext(clientId: number): Promise<Pos2ClientContext> {
    const { data } = await api.get<{ data: Pos2ClientContext }>(`/api/pos-v2/clients/${clientId}/context`);
    return data.data;
}

export async function pos2QrLookup(token: string): Promise<Pos2QrLookupResult> {
    const { data } = await api.post<{ data: Pos2QrLookupResult }>('/api/pos-v2/qr-lookup', { token });
    return data.data;
}

/** Prestations envoyées par les employés (workflow V1) — reprenables en V2. */
export async function getPos2PendingPrestations(): Promise<Pos2PendingPrestation[]> {
    const { data } = await api.get<{ data: Pos2PendingPrestation[] }>('/api/pos-v2/pending');
    return data.data;
}

/** Sans cible : la prestation devient une facture V2 ; avec cible : ses lignes fusionnent dedans. */
export async function importPos2Pending(prestationId: number, targetInvoiceId?: number | null): Promise<Pos2Invoice> {
    const { data } = await api.post<{ data: Pos2Invoice }>(`/api/pos-v2/pending/${prestationId}/import`, {
        target_invoice_id: targetInvoiceId ?? null,
    });
    return data.data;
}

export async function getPos2TodayAppointments(): Promise<Pos2TodayAppointment[]> {
    const { data } = await api.get<{ data: Pos2TodayAppointment[] }>('/api/pos-v2/appointments/today');
    return data.data;
}

export async function openPos2AppointmentInvoice(appointmentId: number): Promise<Pos2Invoice> {
    const { data } = await api.post<{ data: Pos2Invoice }>(`/api/pos-v2/appointments/${appointmentId}/open`);
    return data.data;
}

export async function getPos2SubscriptionPayments(subscriptionId: number): Promise<Pos2SubscriptionPaymentStatus> {
    const { data } = await api.get<{ data: Pos2SubscriptionPaymentStatus }>(
        `/api/pos-v2/subscriptions/${subscriptionId}/payments`,
    );
    return data.data;
}

export async function recordPos2SubscriptionPayment(
    subscriptionId: number,
    payload: { amount: number; payment_method: string; notes?: string | null },
): Promise<Pos2SubscriptionPaymentStatus> {
    const { data } = await api.post<{ data: Pos2SubscriptionPaymentStatus }>(
        `/api/pos-v2/subscriptions/${subscriptionId}/payments`,
        payload,
    );
    return data.data;
}

export async function getPos2History(filters: Pos2HistoryFilters): Promise<Pos2HistoryResponse> {
    const params = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
    const { data } = await api.get<Pos2HistoryResponse>('/api/pos-v2/history', { params });
    return data;
}
