import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as apiClient from '@/lib/api';
import type { User } from '@/types/dashboard';

interface AuthContextValue {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<User>;
    logout: () => Promise<void>;
    hasRole: (role: string) => boolean;
    hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();

    /**
     * The session cookie is the single source of truth — nothing is persisted
     * client-side. A 401 here is the normal logged-out path, so it must not
     * retry (that would stall ProtectedRoute and flash a redirect on cold load).
     */
    const { data, isPending } = useQuery({
        queryKey: ME_QUERY_KEY,
        queryFn: apiClient.getMe,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
    });

    const login = useCallback(
        async (email: string, password: string) => {
            const user = await apiClient.login(email, password);
            queryClient.setQueryData(ME_QUERY_KEY, user);
            return user;
        },
        [queryClient],
    );

    const logout = useCallback(async () => {
        try {
            await apiClient.logout();
        } finally {
            // clear() first — it would otherwise wipe the null we just wrote and
            // let `me` refetch, briefly flipping isPending and flashing the splash.
            queryClient.clear();
            queryClient.setQueryData(ME_QUERY_KEY, null);
        }
    }, [queryClient]);

    const hasRole = useCallback(
        (role: string) => data?.roles.includes(role) ?? false,
        [data],
    );

    // Super Admin implicitly has every permission (mirrors the server-side Gate::before bypass).
    const hasPermission = useCallback(
        (permission: string) =>
            data?.roles.includes('super-admin') || (data?.permissions.includes(permission) ?? false),
        [data],
    );

    const value = useMemo<AuthContextValue>(
        () => ({
            user: data ?? null,
            isLoading: isPending,
            login,
            logout,
            hasRole,
            hasPermission,
        }),
        [data, isPending, login, logout, hasRole, hasPermission],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth doit être utilisé à l’intérieur d’un <AuthProvider>.');
    }
    return context;
}
