import axios, { AxiosError } from 'axios';
import type { DashboardData, User } from '@/types/dashboard';
import type {
    Advance,
    AdvancesResponse,
    Client,
    CreateAdvancePayload,
    CreateExpensePayload,
    CreateTransactionPayload,
    Employee,
    EmployeePayload,
    Expense,
    OpenWorkDayPayload,
    Sale,
    Service,
    ServicePayload,
    WorkDay,
} from '@/types/workday';

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

/** 422 "Une journée est déjà ouverte." when a day is already open. */
export async function openWorkDay(payload: OpenWorkDayPayload): Promise<WorkDay> {
    const { data } = await api.post<{ data: WorkDay }>('/api/work-days', payload);
    return data.data;
}

/** Resolves with the day now carrying a populated `closing_report`. */
export async function closeWorkDay(id: number): Promise<WorkDay> {
    const { data } = await api.post<{ data: WorkDay }>(`/api/work-days/${id}/close`);
    return data.data;
}

/**
 * URL of the end-of-day PDF. Deliberately not an axios call — this is a binary
 * download handed to `window.open`, and the session cookie carries same-origin.
 */
export function getWorkDayPdfUrl(id: number): string {
    return `/api/work-days/${id}/pdf`;
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

export async function getClients(search?: string): Promise<Client[]> {
    const { data } = await api.get<{ data: Client[] }>('/api/clients', {
        params: search ? { search } : undefined,
    });
    return data.data;
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
