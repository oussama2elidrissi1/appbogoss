import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as apiClient from '@/lib/api';
import type { PortalClient } from '@/types/portal';

interface PortalAuthContextValue {
    client: PortalClient | null;
    isLoading: boolean;
    setClient: (client: PortalClient) => void;
    logout: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export const PORTAL_ME_QUERY_KEY = ['portal', 'me'] as const;

/**
 * Mirrors useAuth's shape but talks to the `client` guard (/api/client/*),
 * a completely separate session from staff auth — a customer and a staff
 * member can be logged in on the same browser without either affecting
 * the other, since they're different cookies against different guards.
 */
export function PortalAuthProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();

    const { data, isPending } = useQuery({
        queryKey: PORTAL_ME_QUERY_KEY,
        queryFn: apiClient.getPortalMe,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
    });

    const setClient = useCallback(
        (client: PortalClient) => {
            queryClient.setQueryData(PORTAL_ME_QUERY_KEY, client);
        },
        [queryClient],
    );

    const logout = useCallback(async () => {
        try {
            await apiClient.portalLogout();
        } finally {
            queryClient.setQueryData(PORTAL_ME_QUERY_KEY, null);
        }
    }, [queryClient]);

    const value = useMemo<PortalAuthContextValue>(
        () => ({ client: data ?? null, isLoading: isPending, setClient, logout }),
        [data, isPending, setClient, logout],
    );

    return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth(): PortalAuthContextValue {
    const context = useContext(PortalAuthContext);
    if (!context) {
        throw new Error('usePortalAuth doit être utilisé à l’intérieur d’un <PortalAuthProvider>.');
    }
    return context;
}
