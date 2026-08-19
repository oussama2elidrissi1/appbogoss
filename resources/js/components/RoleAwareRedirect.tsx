import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * Landing page for "/" — sends managers to the company Dashboard and everyone
 * else (plain employees) to their personal space. Kept as a single source of
 * truth so ProtectedRoute's permission-denied fallback can safely point back
 * to "/" without ever looping into another gated route.
 */
export function RoleAwareRedirect() {
    const { user, hasPermission } = useAuth();

    if (hasPermission('reports.view_all')) {
        return <Navigate to="/dashboard" replace />;
    }

    // Partner accounts have no employee record — their whole workspace is
    // the dedicated Partner Portal, not the staff shell.
    if (user?.partner_id) {
        return <Navigate to="/partner/dashboard" replace />;
    }

    return <Navigate to="/mon-espace" replace />;
}
