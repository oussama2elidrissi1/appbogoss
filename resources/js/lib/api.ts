import axios, { AxiosError } from 'axios';
import type { ApplicationSettings, ApplicationSettingsPayload, DashboardData, User } from '@/types/dashboard';
import type {
    Advance,
    AdvancesReport,
    AdvancesResponse,
    Appointment,
    AppointmentPayload,
    Client,
    ClientOverview,
    ClientPayload,
    CreateAdvancePayload,
    CreatedPartnerResponse,
    Partner,
    PartnerPayload,
    CreateExpensePayload,
    CreateTransactionPayload,
    Employee,
    EmployeePayload,
    Expense,
    OpenWorkDayPayload,
    Product,
    ProductPayload,
    Sale,
    Service,
    ServicePayload,
    MonthlyReport,
    UpdateAdvancePayload,
    UpdateExpensePayload,
    WorkDay,
} from '@/types/workday';
import type {
    ActivityLogEntry,
    AddPrestationItemPayload,
    AppNotification,
    CommissionPayout,
    CommissionPayoutRow,
    CommissionsReport,
    ConfirmPrestationPaymentPayload,
    CreatePrestationPayload,
    MyCommissionRow,
    MyDashboard,
    MyReport,
    Prestation,
    UpdatePrestationItemPayload,
} from '@/types/prestation';
import type {
    AdminSubscription,
    ClientLoyaltyStatus,
    ClientSubscription,
    LoyaltyProgram,
    LoyaltyProgramPayload,
    LoyaltyQrSettings,
    LoyaltySettings,
    PurchaseSubscriptionPayload,
    SubscriptionPlan,
    SubscriptionPlanPayload,
    SubscriptionScanCard,
    SubscriptionUsageRow,
    SubscriptionsDashboard,
    ValidateVisitResponse,
} from '@/types/loyalty';
import type {
    PortalClient,
    PortalHome,
    PortalProgramProgress,
    PortalRewardsResponse,
    PortalSubscription,
} from '@/types/portal';

/**
 * Sanctum SPA (cookie) authentication:
 * - `withCredentials` sends the session cookie on same-origin requests.
 * - `withXSRFToken` (axios >= 1.6) makes axios read the `XSRF-TOKEN` cookie and
 *   replay it as the `X-XSRF-TOKEN` header, which Laravel's CSRF middleware expects.
 */
axios.defaults.withCredentials = true;
axios.defaults.withXSRFToken = true;

export const api = axios.create({
    baseURL: '/',
    withCredentials: true,
    withXSRFToken: true,
    headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
    },
});

/** Pulls a readable message out of a Laravel JSON error response. */
export function getErrorMessage(error: unknown, fallback = 'Une erreur est survenue.'): string {
    if (error instanceof AxiosError) {
        const data = error.response?.data as { message?: string } | undefined;
        if (data?.message) return data.message;
        if (!error.response) return 'Connexion au serveur impossible.';
    }
    return fallback;
}

/**
 * Primes the XSRF-TOKEN cookie. Must run before the first stateful POST.
 * The `_` cache-buster guarantees this always hits the server fresh, even if
 * a proxy/CDN in front of the app ignores the no-store response headers.
 */
export async function getCsrfCookie(): Promise<void> {
    await api.get('/sanctum/csrf-cookie', { params: { _: Date.now() } });
}

export async function login(email: string, password: string, remember = true): Promise<User> {
    await getCsrfCookie();
    const { data } = await api.post<User>('/api/login', { email, password, remember });
    return data;
}

export async function logout(): Promise<void> {
    await api.post('/api/logout');
}

export async function getMe(): Promise<User> {
    const { data } = await api.get<User>('/api/me');
    return data;
}

export async function getSettings(): Promise<ApplicationSettings> {
    const { data } = await api.get<{ data: ApplicationSettings }>('/api/settings');
    return data.data;
}

export async function updateSettings(payload: ApplicationSettingsPayload): Promise<ApplicationSettings> {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
        if (value !== null && value !== undefined) formData.append(key, value instanceof File ? value : String(value));
    });
    const { data } = await api.post<{ data: ApplicationSettings }>('/api/settings', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
}

export async function removeSettingsLogo(): Promise<ApplicationSettings> {
    const { data } = await api.delete<{ data: ApplicationSettings }>('/api/settings/logo');
    return data.data;
}

export async function updateProfile(payload: { name: string; email: string }): Promise<User> {
    const { data } = await api.put<User>('/api/profile', payload);
    return data;
}

export async function updatePassword(payload: { current_password: string; password: string; password_confirmation: string }): Promise<void> {
    await api.post('/api/profile/password', payload);
}

export async function getDashboard(): Promise<DashboardData> {
    const { data } = await api.get<DashboardData>('/api/dashboard');
    return data;
}

/* ------------------------------------------------------------------ *
 * Exploitation quotidienne
 *
 * Unlike `/api/dashboard` (bare object), every endpoint below wraps its
 * payload in `{ "data": ... }` — hence the `.data.data` unwrap. The single
 * exception is `getAdvances`, which carries `outstanding_total` alongside
 * `data` and is therefore returned as the full envelope.
 * ------------------------------------------------------------------ */

/** `null` when no day is currently open. */
export async function getActiveWorkDay(): Promise<WorkDay | null> {
    const { data } = await api.get<{ data: WorkDay | null }>('/api/work-days/active');
    return data.data;
}

export async function getWorkDay(id: number): Promise<WorkDay> {
    const { data } = await api.get<{ data: WorkDay }>(`/api/work-days/${id}`);
    return data.data;
}

export async function getWorkDays(): Promise<WorkDay[]> {
    const { data } = await api.get<{ data: WorkDay[] }>('/api/work-days');
    return data.data;
}

/** 422 "Une journée est déjà ouverte." when a day is already open. */
export async function openWorkDay(payload: OpenWorkDayPayload): Promise<WorkDay> {
    const { data } = await api.post<{ data: WorkDay }>('/api/work-days', payload);
    return data.data;
}

/** Resolves with the day now carrying a populated `closing_report`. */
export async function closeWorkDay(
    id: number,
    payload?: { closing_balance_actual?: number | null; closing_comment?: string | null },
): Promise<WorkDay> {
    const { data } = await api.post<{ data: WorkDay }>(`/api/work-days/${id}/close`, payload ?? {});
    return data.data;
}

/**
 * URL of the end-of-day PDF. Deliberately not an axios call — this is a binary
 * download handed to `window.open`, and the session cookie carries same-origin.
 */
export function getWorkDayPdfUrl(id: number): string {
    return `/work-days/${id}/pdf`;
}

export async function getMonthlyReport(month?: string): Promise<MonthlyReport> {
    const { data } = await api.get<{ data: MonthlyReport }>('/api/reports/monthly', {
        params: month ? { month } : undefined,
    });
    return data.data;
}

export function getMonthlyReportPdfUrl(month: string): string {
    return `/reports/monthly/pdf?month=${encodeURIComponent(month)}`;
}

export async function getAdvancesReport(options?: {
    from?: string;
    to?: string;
    employeeId?: number;
}): Promise<AdvancesReport> {
    const { data } = await api.get<{ data: AdvancesReport }>('/api/reports/advances', {
        params: {
            ...(options?.from ? { from: options.from } : {}),
            ...(options?.to ? { to: options.to } : {}),
            ...(options?.employeeId ? { employee_id: options.employeeId } : {}),
        },
    });
    return data.data;
}

/** 422 "Aucune journée ouverte." when no day is open. */
export async function createTransaction(payload: CreateTransactionPayload): Promise<Sale> {
    const { data } = await api.post<{ data: Sale }>('/api/transactions', payload);
    return data.data;
}

/** Newest first. */
export async function getTransactions(workDayId: number): Promise<Sale[]> {
    const { data } = await api.get<{ data: Sale[] }>('/api/transactions', {
        params: { work_day_id: workDayId },
    });
    return data.data;
}

export async function deleteTransaction(id: number): Promise<Sale> {
    const { data } = await api.delete<{ data: Sale }>(`/api/transactions/${id}`);
    return data.data;
}

export async function recordTransactionPrint(id: number): Promise<Sale> {
    const { data } = await api.post<{ data: Sale }>(`/api/transactions/${id}/print`);
    return data.data;
}

export async function createAdvance(payload: CreateAdvancePayload): Promise<Advance> {
    const { data } = await api.post<{ data: Advance }>('/api/advances', payload);
    return data.data;
}

/** Returns the full envelope — `outstanding_total` sits next to `data`. */
export async function getAdvances(employeeId: number): Promise<AdvancesResponse> {
    const { data } = await api.get<AdvancesResponse>('/api/advances', {
        params: { employee_id: employeeId },
    });
    return data;
}

/** The logged-in employee's own advances — read-only, scoped server-side. */
export async function getMyAdvances(): Promise<AdvancesResponse> {
    const { data } = await api.get<AdvancesResponse>('/api/me/advances');
    return data;
}

export async function settleAdvance(id: number): Promise<Advance> {
    const { data } = await api.post<{ data: Advance }>(`/api/advances/${id}/settle`);
    return data.data;
}

export async function updateAdvance(id: number, payload: UpdateAdvancePayload): Promise<Advance> {
    const { data } = await api.put<{ data: Advance }>(`/api/advances/${id}`, payload);
    return data.data;
}

export async function deleteAdvance(id: number, password: string): Promise<void> {
    await api.delete(`/api/advances/${id}`, { data: { password } });
}

/** Marks every outstanding advance given before `before` as settled, without a payout — for money reimbursed off-app before it was ever recorded as settled. */
export async function settleAdvancesBefore(
    employeeId: number,
    before: string,
    password: string,
): Promise<{ settled_count: number; settled_total: number }> {
    const { data } = await api.post<{ settled_count: number; settled_total: number }>(
        '/api/advances/settle-before',
        { employee_id: employeeId, before, password },
    );
    return data;
}

export async function createExpense(payload: CreateExpensePayload): Promise<Expense> {
    const { data } = await api.post<{ data: Expense }>('/api/expenses', payload);
    return data.data;
}

export async function getExpenses(params?: {
    workDayId?: number;
    from?: string;
    to?: string;
}): Promise<Expense[]> {
    const { data } = await api.get<{ data: Expense[] }>('/api/expenses', {
        params: params
            ? { work_day_id: params.workDayId, from: params.from, to: params.to }
            : undefined,
    });
    return data.data;
}

/** Fixes an expense that was actually a salary advance recorded in the wrong place. */
export async function convertExpenseToAdvance(expenseId: number, employeeId: number): Promise<Advance> {
    const { data } = await api.post<{ data: Advance }>(`/api/expenses/${expenseId}/convert-to-advance`, {
        employee_id: employeeId,
    });
    return data.data;
}

export async function updateExpense(id: number, payload: UpdateExpensePayload): Promise<Expense> {
    const { data } = await api.put<{ data: Expense }>(`/api/expenses/${id}`, payload);
    return data.data;
}

export async function getEmployees(options?: {
    includeInactive?: boolean;
    search?: string;
}): Promise<Employee[]> {
    const { data } = await api.get<{ data: Employee[] }>('/api/employees', {
        params: {
            ...(options?.includeInactive ? { include_inactive: 1 } : {}),
            ...(options?.search ? { search: options.search } : {}),
        },
    });
    return data.data;
}

export async function getEmployee(id: number): Promise<Employee> {
    const { data } = await api.get<{ data: Employee }>(`/api/employees/${id}`);
    return data.data;
}

export async function createEmployee(payload: EmployeePayload): Promise<Employee> {
    const { data } = await api.post<{ data: Employee }>('/api/employees', payload);
    return data.data;
}

export async function updateEmployee(id: number, payload: EmployeePayload): Promise<Employee> {
    const { data } = await api.put<{ data: Employee }>(`/api/employees/${id}`, payload);
    return data.data;
}

export async function deleteEmployee(id: number): Promise<void> {
    await api.delete(`/api/employees/${id}`);
}

export async function resetEmployeePassword(
    id: number,
    password?: string,
): Promise<{ temporary_password: string }> {
    const { data } = await api.post<{ data: { temporary_password: string } }>(
        `/api/employees/${id}/reset-password`,
        password ? { password } : {},
    );
    return data.data;
}

export async function quickCreateEmployeeAccount(
    id: number,
): Promise<{ login_email: string; temporary_password: string; employee: Employee }> {
    const { data } = await api.post<{
        data: { login_email: string; temporary_password: string; employee: Employee };
    }>(`/api/employees/${id}/quick-create-account`, {});
    return data.data;
}

export async function getClients(search?: string): Promise<Client[]> {
    const { data } = await api.get<{ data: Client[] }>('/api/clients', {
        params: search ? { search } : undefined,
    });
    return data.data;
}

export async function createClient(payload: ClientPayload): Promise<Client> {
    const { data } = await api.post<{ data: Client }>('/api/clients', payload);
    return data.data;
}

export async function updateClient(id: number, payload: ClientPayload): Promise<Client> {
    const { data } = await api.put<{ data: Client }>(`/api/clients/${id}`, payload);
    return data.data;
}

export async function deleteClient(id: number): Promise<void> {
    await api.delete(`/api/clients/${id}`);
}

export async function getClientOverview(id: number): Promise<ClientOverview> {
    const { data } = await api.get<{ data: ClientOverview }>(`/api/clients/${id}/overview`);
    return data.data;
}

/** Creates or resets the customer's portal access; the password is shown once. */
export async function setClientPortalPassword(
    id: number,
    password?: string,
): Promise<{ phone: string | null; temporary_password: string }> {
    const { data } = await api.post<{ data: { phone: string | null; temporary_password: string } }>(
        `/api/clients/${id}/portal-password`,
        password ? { password } : {},
    );
    return data.data;
}

export async function getClientPersonalQr(id: number): Promise<{ enabled: boolean; token: string | null }> {
    const { data } = await api.get<{ data: { enabled: boolean; token: string | null } }>(`/api/clients/${id}/qr`);
    return data.data;
}

export async function regenerateClientPersonalQr(id: number): Promise<string> {
    const { data } = await api.post<{ data: { token: string } }>(`/api/clients/${id}/qr/regenerate`);
    return data.data.token;
}

export async function getServices(
    categoryOrOptions?:
        | string
        | {
              category?: string;
              includeInactive?: boolean;
              search?: string;
          },
): Promise<Service[]> {
    const options =
        typeof categoryOrOptions === 'string' ? { category: categoryOrOptions } : categoryOrOptions;

    const { data } = await api.get<{ data: Service[] }>('/api/services', {
        params: {
            ...(options?.category ? { category: options.category } : {}),
            ...(options?.includeInactive ? { include_inactive: 1 } : {}),
            ...(options?.search ? { search: options.search } : {}),
        },
    });
    return data.data;
}

export async function createService(payload: ServicePayload): Promise<Service> {
    const { data } = await api.post<{ data: Service }>('/api/services', payload);
    return data.data;
}

export async function updateService(id: number, payload: ServicePayload): Promise<Service> {
    const { data } = await api.put<{ data: Service }>(`/api/services/${id}`, payload);
    return data.data;
}

export async function deleteService(id: number): Promise<void> {
    await api.delete(`/api/services/${id}`);
}

export async function getProducts(options?: {
    search?: string;
    category?: string;
    stockArea?: 'vitrine' | 'refrigerateur';
}): Promise<Product[]> {
    const { data } = await api.get<{ data: Product[] }>('/api/products', {
        params: {
            ...(options?.search ? { search: options.search } : {}),
            ...(options?.category ? { category: options.category } : {}),
            ...(options?.stockArea ? { stock_area: options.stockArea } : {}),
        },
    });
    return data.data;
}

export async function createProduct(payload: ProductPayload): Promise<Product> {
    const { data } = await api.post<{ data: Product }>('/api/products', payload);
    return data.data;
}

export async function updateProduct(id: number, payload: ProductPayload): Promise<Product> {
    const { data } = await api.put<{ data: Product }>(`/api/products/${id}`, payload);
    return data.data;
}

export async function deleteProduct(id: number): Promise<void> {
    await api.delete(`/api/products/${id}`);
}

export async function getAppointments(options?: {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    employeeId?: number;
    status?: string;
}): Promise<Appointment[]> {
    const { data } = await api.get<{ data: Appointment[] }>('/api/appointments', {
        params: {
            ...(options?.date ? { date: options.date } : {}),
            ...(options?.dateFrom ? { date_from: options.dateFrom } : {}),
            ...(options?.dateTo ? { date_to: options.dateTo } : {}),
            ...(options?.employeeId ? { employee_id: options.employeeId } : {}),
            ...(options?.status ? { status: options.status } : {}),
        },
    });
    return data.data;
}

export async function createAppointment(payload: AppointmentPayload): Promise<Appointment> {
    const { data } = await api.post<{ data: Appointment }>('/api/appointments', payload);
    return data.data;
}

export async function updateAppointment(
    id: number,
    payload: AppointmentPayload,
): Promise<Appointment> {
    const { data } = await api.put<{ data: Appointment }>(`/api/appointments/${id}`, payload);
    return data.data;
}

export async function deleteAppointment(id: number): Promise<void> {
    await api.delete(`/api/appointments/${id}`);
}

export async function getPartners(options?: { search?: string; includeInactive?: boolean }): Promise<Partner[]> {
    const { data } = await api.get<{ data: Partner[] }>('/api/partners', {
        params: {
            ...(options?.search ? { search: options.search } : {}),
            ...(options?.includeInactive === false ? { include_inactive: 0 } : {}),
        },
    });
    return data.data;
}

export async function createPartner(payload: PartnerPayload): Promise<CreatedPartnerResponse> {
    const { data } = await api.post<{ data: CreatedPartnerResponse }>('/api/partners', payload);
    return data.data;
}

export async function updatePartner(id: number, payload: PartnerPayload): Promise<Partner> {
    const { data } = await api.put<{ data: Partner }>(`/api/partners/${id}`, payload);
    return data.data;
}

export async function deletePartner(id: number): Promise<void> {
    await api.delete(`/api/partners/${id}`);
}

export async function resetPartnerPassword(id: number, password?: string): Promise<string> {
    const { data } = await api.post<{ data: { temporary_password: string } }>(
        `/api/partners/${id}/reset-password`,
        password ? { password } : {},
    );
    return data.data.temporary_password;
}

export async function setPartnerStatus(id: number, isActive: boolean): Promise<Partner> {
    const { data } = await api.patch<{ data: Partner }>(`/api/partners/${id}/status`, {
        is_active: isActive,
    });
    return data.data;
}

export async function getPrestations(options?: {
    status?: string;
    employeeId?: number;
    from?: string;
    to?: string;
}): Promise<Prestation[]> {
    const { data } = await api.get<{ data: Prestation[] }>('/api/prestations', {
        params: {
            ...(options?.status ? { status: options.status } : {}),
            ...(options?.employeeId ? { employee_id: options.employeeId } : {}),
            ...(options?.from ? { from: options.from } : {}),
            ...(options?.to ? { to: options.to } : {}),
        },
    });
    return data.data;
}

export async function getPendingPrestations(): Promise<Prestation[]> {
    const { data } = await api.get<{ data: Prestation[] }>('/api/prestations/pending');
    return data.data;
}

export async function getPrestation(id: number): Promise<Prestation> {
    const { data } = await api.get<{ data: Prestation }>(`/api/prestations/${id}`);
    return data.data;
}

export async function createPrestation(payload: CreatePrestationPayload): Promise<Prestation> {
    const { data } = await api.post<{ data: Prestation }>('/api/prestations', payload);
    return data.data;
}

export async function addPrestationItem(
    prestationId: number,
    payload: AddPrestationItemPayload,
): Promise<Prestation> {
    const { data } = await api.post<{ data: Prestation }>(
        `/api/prestations/${prestationId}/items`,
        payload,
    );
    return data.data;
}

export async function updatePrestationItem(
    prestationId: number,
    itemId: number,
    payload: UpdatePrestationItemPayload,
): Promise<Prestation> {
    const { data } = await api.patch<{ data: Prestation }>(
        `/api/prestations/${prestationId}/items/${itemId}`,
        payload,
    );
    return data.data;
}

export async function removePrestationItem(prestationId: number, itemId: number): Promise<Prestation> {
    const { data } = await api.delete<{ data: Prestation }>(
        `/api/prestations/${prestationId}/items/${itemId}`,
    );
    return data.data;
}

export async function completePrestationServices(prestationId: number): Promise<Prestation> {
    const { data } = await api.post<{ data: Prestation }>(
        `/api/prestations/${prestationId}/complete-services`,
    );
    return data.data;
}

export async function sendPrestationToCaisse(prestationId: number): Promise<Prestation> {
    const { data } = await api.post<{ data: Prestation }>(
        `/api/prestations/${prestationId}/send-to-caisse`,
    );
    return data.data;
}

export async function confirmPrestationPayment(
    prestationId: number,
    payload: ConfirmPrestationPaymentPayload,
): Promise<Prestation> {
    const { data } = await api.post<{ data: Prestation }>(
        `/api/prestations/${prestationId}/confirm-payment`,
        payload,
    );
    return data.data;
}

export async function cancelPrestation(prestationId: number, reason?: string): Promise<Prestation> {
    const { data } = await api.post<{ data: Prestation }>(`/api/prestations/${prestationId}/cancel`, {
        reason,
    });
    return data.data;
}

export async function refundPrestation(prestationId: number, reason: string): Promise<Prestation> {
    const { data } = await api.post<{ data: Prestation }>(`/api/prestations/${prestationId}/refund`, {
        reason,
    });
    return data.data;
}

export async function getMyDashboard(): Promise<MyDashboard> {
    const { data } = await api.get<{ data: MyDashboard }>('/api/me/dashboard');
    return data.data;
}

export async function getMyCommissions(options?: {
    from?: string;
    to?: string;
    serviceId?: number;
    status?: string;
}): Promise<MyCommissionRow[]> {
    const { data } = await api.get<{ data: MyCommissionRow[] }>('/api/me/commissions', {
        params: {
            ...(options?.from ? { from: options.from } : {}),
            ...(options?.to ? { to: options.to } : {}),
            ...(options?.serviceId ? { service_id: options.serviceId } : {}),
            ...(options?.status ? { status: options.status } : {}),
        },
    });
    return data.data;
}

export async function getMyReport(options?: { from?: string; to?: string }): Promise<MyReport> {
    const { data } = await api.get<{ data: MyReport }>('/api/me/report', {
        params: {
            ...(options?.from ? { from: options.from } : {}),
            ...(options?.to ? { to: options.to } : {}),
        },
    });
    return data.data;
}

export async function getActivityLogs(options?: {
    from?: string;
    to?: string;
    action?: string;
}): Promise<ActivityLogEntry[]> {
    const { data } = await api.get<{ data: ActivityLogEntry[] }>('/api/activity-logs', {
        params: {
            ...(options?.from ? { from: options.from } : {}),
            ...(options?.to ? { to: options.to } : {}),
            ...(options?.action ? { action: options.action } : {}),
        },
    });
    return data.data;
}

export async function getNotifications(): Promise<{ data: AppNotification[]; unread_count: number }> {
    const { data } = await api.get<{ data: AppNotification[]; unread_count: number }>('/api/notifications');
    return data;
}

export async function markNotificationRead(id: string): Promise<void> {
    await api.post(`/api/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
    await api.post('/api/notifications/read-all');
}

export async function getCommissionsReport(options?: {
    from?: string;
    to?: string;
    employeeId?: number;
}): Promise<CommissionsReport> {
    const { data } = await api.get<{ data: CommissionsReport }>('/api/reports/commissions', {
        params: {
            ...(options?.from ? { from: options.from } : {}),
            ...(options?.to ? { to: options.to } : {}),
            ...(options?.employeeId ? { employee_id: options.employeeId } : {}),
        },
    });
    return data.data;
}

export function myReportExportUrl(options?: { from?: string; to?: string }): string {
    const params = new URLSearchParams();
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);
    const query = params.toString();
    return `/api/me/report/export${query ? `?${query}` : ''}`;
}

export async function getCommissionPayouts(period: string, employeeId?: number): Promise<CommissionPayoutRow[]> {
    const { data } = await api.get<{ data: CommissionPayoutRow[] }>('/api/commission-payouts', {
        params: { period, ...(employeeId ? { employee_id: employeeId } : {}) },
    });
    return data.data;
}

export async function payCommission(payload: {
    employee_id: number;
    period: string;
    notes?: string;
}): Promise<CommissionPayout> {
    const { data } = await api.post<{ data: CommissionPayout }>('/api/commission-payouts', payload);
    return data.data;
}

export async function getCommissionPayoutHistory(employeeId: number): Promise<CommissionPayout[]> {
    const { data } = await api.get<{ data: CommissionPayout[] }>(
        `/api/employees/${employeeId}/commission-payouts`,
    );
    return data.data;
}

export async function getUsers(): Promise<User[]> {
    const { data } = await api.get<{ data: User[] }>('/api/users');
    return data.data;
}

export async function updateUserAccess(
    id: number,
    payload: { role?: string; is_active?: boolean },
): Promise<User> {
    const { data } = await api.patch<{ data: User }>(`/api/users/${id}`, payload);
    return data.data;
}

export async function resetUserPassword(id: number): Promise<{ temporary_password: string }> {
    const { data } = await api.post<{ data: { temporary_password: string } }>(`/api/users/${id}/reset-password`);
    return data.data;
}

export async function getLoyaltyPrograms(): Promise<LoyaltyProgram[]> {
    const { data } = await api.get<{ data: LoyaltyProgram[] }>('/api/loyalty-programs');
    return data.data;
}

export async function createLoyaltyProgram(payload: LoyaltyProgramPayload): Promise<LoyaltyProgram> {
    const { data } = await api.post<{ data: LoyaltyProgram }>('/api/loyalty-programs', payload);
    return data.data;
}

export async function updateLoyaltyProgram(id: number, payload: LoyaltyProgramPayload): Promise<LoyaltyProgram> {
    const { data } = await api.put<{ data: LoyaltyProgram }>(`/api/loyalty-programs/${id}`, payload);
    return data.data;
}

export async function deactivateLoyaltyProgram(id: number): Promise<LoyaltyProgram> {
    const { data } = await api.delete<{ data: LoyaltyProgram }>(`/api/loyalty-programs/${id}`);
    return data.data;
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const { data } = await api.get<{ data: SubscriptionPlan[] }>('/api/subscription-plans');
    return data.data;
}

export async function createSubscriptionPlan(payload: SubscriptionPlanPayload): Promise<SubscriptionPlan> {
    const { data } = await api.post<{ data: SubscriptionPlan }>('/api/subscription-plans', payload);
    return data.data;
}

export async function updateSubscriptionPlan(id: number, payload: SubscriptionPlanPayload): Promise<SubscriptionPlan> {
    const { data } = await api.put<{ data: SubscriptionPlan }>(`/api/subscription-plans/${id}`, payload);
    return data.data;
}

export async function deactivateSubscriptionPlan(id: number): Promise<SubscriptionPlan> {
    const { data } = await api.delete<{ data: SubscriptionPlan }>(`/api/subscription-plans/${id}`);
    return data.data;
}

export async function purchaseSubscription(clientId: number, payload: PurchaseSubscriptionPayload): Promise<ClientSubscription> {
    const { data } = await api.post<{ data: ClientSubscription }>(`/api/clients/${clientId}/subscriptions`, payload);
    return data.data;
}

export async function getClientLoyaltyStatus(clientId: number): Promise<ClientLoyaltyStatus> {
    const { data } = await api.get<{ data: ClientLoyaltyStatus }>(`/api/clients/${clientId}/loyalty-status`);
    return data.data;
}

/* ------------------------------------------------------------------ *
 * Fidélité → QR Code (admin)
 * ------------------------------------------------------------------ */

export async function getLoyaltyQr(): Promise<LoyaltyQrSettings> {
    const { data } = await api.get<{ data: LoyaltyQrSettings }>('/api/loyalty/qr');
    return data.data;
}

export async function regenerateLoyaltyQr(): Promise<{ token: string }> {
    const { data } = await api.post<{ data: { token: string } }>('/api/loyalty/qr/regenerate');
    return data.data;
}

export async function updateLoyaltySettings(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data } = await api.put<{ data: Record<string, unknown> }>('/api/loyalty/settings', payload);
    return data.data;
}

export async function getLoyaltySettingsFull(): Promise<LoyaltySettings> {
    const { data } = await api.get<{ data: LoyaltySettings }>('/api/loyalty/settings');
    return data.data;
}

/* ------------------------------------------------------------------ *
 * Subscriptions module: scanner, sold subscriptions, history, reports.
 * ------------------------------------------------------------------ */

export async function getSubscriptionScanCard(token: string): Promise<SubscriptionScanCard> {
    const { data } = await api.get<{ data: SubscriptionScanCard }>(
        `/api/subscriptions/scan/${encodeURIComponent(token)}`,
    );
    return data.data;
}

export async function validateSubscriptionVisit(
    token: string,
    payload: { subscription_plan_service_id: number; employee_id: number; notes?: string | null },
): Promise<ValidateVisitResponse> {
    const { data } = await api.post<{ data: ValidateVisitResponse }>(
        `/api/subscriptions/scan/${encodeURIComponent(token)}/validate`,
        payload,
    );
    return data.data;
}

export async function getAdminSubscriptions(options?: {
    status?: string;
    planId?: number;
    clientId?: number;
    search?: string;
    expiringWithin?: number;
}): Promise<AdminSubscription[]> {
    const { data } = await api.get<{ data: AdminSubscription[] }>('/api/client-subscriptions', {
        params: {
            ...(options?.status ? { status: options.status } : {}),
            ...(options?.planId ? { plan_id: options.planId } : {}),
            ...(options?.clientId ? { client_id: options.clientId } : {}),
            ...(options?.search ? { search: options.search } : {}),
            ...(options?.expiringWithin ? { expiring_within: options.expiringWithin } : {}),
        },
    });
    return data.data;
}

export async function getSubscriptionUsages(options?: {
    from?: string;
    to?: string;
    status?: string;
    planId?: number;
    serviceId?: number;
    employeeId?: number;
    subscriptionId?: number;
    search?: string;
}): Promise<SubscriptionUsageRow[]> {
    const { data } = await api.get<{ data: SubscriptionUsageRow[] }>('/api/subscription-usages', {
        params: {
            ...(options?.from ? { from: options.from } : {}),
            ...(options?.to ? { to: options.to } : {}),
            ...(options?.status ? { status: options.status } : {}),
            ...(options?.planId ? { plan_id: options.planId } : {}),
            ...(options?.serviceId ? { service_id: options.serviceId } : {}),
            ...(options?.employeeId ? { employee_id: options.employeeId } : {}),
            ...(options?.subscriptionId ? { subscription_id: options.subscriptionId } : {}),
            ...(options?.search ? { search: options.search } : {}),
        },
    });
    return data.data;
}

export async function getSubscriptionsDashboard(): Promise<SubscriptionsDashboard> {
    const { data } = await api.get<{ data: SubscriptionsDashboard }>('/api/subscriptions/dashboard');
    return data.data;
}

export async function cancelClientSubscription(
    id: number,
    options?: { reason?: string; refund?: boolean },
): Promise<AdminSubscription> {
    const { data } = await api.post<{ data: AdminSubscription }>(`/api/client-subscriptions/${id}/cancel`, {
        ...(options?.reason ? { reason: options.reason } : {}),
        refund: options?.refund ?? false,
    });
    return data.data;
}

/** One-click refund: cancels the subscription and voids its purchase ticket. */
export async function refundClientSubscription(id: number): Promise<AdminSubscription> {
    const { data } = await api.post<{ data: AdminSubscription }>(`/api/client-subscriptions/${id}/refund`, {});
    return data.data;
}

export async function regenerateSubscriptionQr(id: number): Promise<AdminSubscription> {
    const { data } = await api.post<{ data: AdminSubscription }>(`/api/client-subscriptions/${id}/regenerate-qr`, {});
    return data.data;
}

export async function suspendClientSubscription(
    id: number,
    payload: { from: string; until: string; reason: string },
): Promise<void> {
    await api.post(`/api/client-subscriptions/${id}/suspend`, payload);
}

export async function resumeClientSubscription(id: number): Promise<void> {
    await api.post(`/api/client-subscriptions/${id}/resume`, {});
}

export async function extendClientSubscription(id: number, payload: { days: number; reason: string }): Promise<void> {
    await api.post(`/api/client-subscriptions/${id}/extend`, payload);
}

export async function renewClientSubscription(
    id: number,
    payload?: { payment_method?: string; starts_on?: string },
): Promise<void> {
    await api.post(`/api/client-subscriptions/${id}/renew`, payload ?? {});
}

/* ------------------------------------------------------------------ *
 * Public join / login (no auth) — the QR scan → registration flow, and
 * phone+password login for returning customers. No OTP/SMS/email step:
 * the account IS the phone number + a password the customer picks.
 * ------------------------------------------------------------------ */

export interface JoinPayload {
    first_name: string;
    last_name: string;
    phone: string;
    password: string;
    password_confirmation: string;
    email?: string;
    birth_date?: string;
    gender?: 'female' | 'male' | 'other';
    terms_consent: boolean;
    marketing_consent?: boolean;
    token: string;
}

export async function checkJoinAvailable(token: string): Promise<boolean> {
    const { data } = await api.get<{ data: { available: boolean } }>('/api/public/join/status', {
        params: { t: token },
    });
    return data.data.available;
}

/** Registration doubles as login — a successful call already establishes the portal session. */
export async function joinLoyaltyProgram(payload: JoinPayload): Promise<PortalClient> {
    await getCsrfCookie();
    const { data } = await api.post<{ data: PortalClient }>('/api/public/join', payload);
    return data.data;
}

export async function loginClient(phone: string, password: string): Promise<PortalClient> {
    await getCsrfCookie();
    const { data } = await api.post<{ data: PortalClient }>('/api/public/login', { phone, password });
    return data.data;
}

/* ------------------------------------------------------------------ *
 * Customer portal ("Mon BOGOSLAND") — `client` guard, cookie session
 * established by joinLoyaltyProgram()/loginClient() above.
 * ------------------------------------------------------------------ */

export async function getPortalMe(): Promise<PortalClient> {
    const { data } = await api.get<{ data: PortalClient }>('/api/client/me');
    return data.data;
}

export async function portalLogout(): Promise<void> {
    await api.post('/api/client/logout');
}

export async function getPortalHome(): Promise<PortalHome> {
    const { data } = await api.get<{ data: PortalHome }>('/api/client/home');
    return data.data;
}

export async function getPortalPrograms(): Promise<PortalProgramProgress[]> {
    const { data } = await api.get<{ data: PortalProgramProgress[] }>('/api/client/loyalty');
    return data.data;
}

export async function getPortalRewards(): Promise<PortalRewardsResponse> {
    const { data } = await api.get<{ data: PortalRewardsResponse }>('/api/client/rewards');
    return data.data;
}

export async function getPortalSubscriptions(): Promise<PortalSubscription[]> {
    const { data } = await api.get<{ data: PortalSubscription[] }>('/api/client/subscriptions');
    return data.data;
}
