import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getActiveWorkDay } from '@/lib/api';
import type { WorkDay } from '@/types/workday';

/**
 * Query keys for the daily-operations module. Kept together so invalidation
 * after a mutation stays consistent across Caisse, Dépenses and Employés.
 */
export const workDayKeys = {
    active: ['work-day', 'active'] as const,
    all: ['work-day'] as const,
    transactions: (workDayId: number) => ['transactions', workDayId] as const,
    expenses: (workDayId: number | null) => ['expenses', workDayId] as const,
    advances: (employeeId: number) => ['advances', employeeId] as const,
    employees: ['employees'] as const,
    services: (category: string) => ['services', category] as const,
    products: (search = '') => ['products', search] as const,
    clients: (search: string) => ['clients', search] as const,
};

/**
 * The single source of truth for "is a day open right now".
 * Caisse and Dépenses both call this; React Query dedupes the request.
 */
export function useActiveWorkDay(): UseQueryResult<WorkDay | null> {
    return useQuery({
        queryKey: workDayKeys.active,
        queryFn: getActiveWorkDay,
        staleTime: 15_000,
    });
}

/**
 * Refreshes everything a day-level mutation can affect — including the
 * dashboard, which mirrors the open day's running totals.
 */
export function useRefreshDay() {
    const queryClient = useQueryClient();

    return useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: workDayKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }, [queryClient]);
}
