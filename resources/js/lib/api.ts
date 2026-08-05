import axios, { AxiosError } from 'axios';
import type { ApplicationSettings, ApplicationSettingsPayload, DashboardData, User } from '@/types/dashboard';
import type {
    Advance,
    AdvancesReport,
    AdvancesResponse,
    Appointment,
    AppointmentPayload,
    Client,
    ClientPayload,
    CreateAdvancePayload,
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
} from '@/types/prestation';

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

export async function login(email: string, password: string): Promise<User> {
    await getCsrfCookie();
    const { data } = await api.post<User>('/api/login', { email, password });
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

export async function createExpense(payload: CreateExpensePayload): Promise<Expense> {
    const { data } = await api.post<{ data: Expense }>('/api/expenses', payload);
    return data.data;
}

export async function getExpenses(workDayId?: number): Promise<Expense[]> {
    const { data } = await api.get<{ data: Expense[] }>('/api/expenses', {
        params: workDayId ? { work_day_id: workDayId } : undefined,
    });
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
