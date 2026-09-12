import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Scissors } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/**
 * Gates the authenticated shell. While the `me` query is in flight we render a
 * neutral splash rather than redirecting, so a cold load never flashes /login.
 *
 * `role` verrouille une route sur un rôle précis. C'est plus strict que
 * `permission`, que le super-admin satisfait TOUJOURS (voir useAuth) : une
 * route réservée au patron — la caisse de test — ne peut se garder qu'ainsi.
 *
 * When `permission` is set, an authenticated user lacking it is redirected to
 * "/" instead of the page rendering and failing on every request — "/" then
 * resolves to the right landing page per role (see RoleAwareRedirect), so this
 * never loops back into another permission-gated route.
 */
export function ProtectedRoute({
    permission,
    role,
}: { permission?: string | string[]; role?: string } = {}) {
    const { user, isLoading, hasPermission, hasRole } = useAuth();
    const location = useLocation();

    if (isLoading) return <AuthSplash />;

    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

    const allowed =
        (!role || hasRole(role)) &&
        (!permission ||
            (Array.isArray(permission) ? permission.some(hasPermission) : hasPermission(permission)));
    if (!allowed) return <Navigate to="/" replace />;

    return <Outlet />;
}

function AuthSplash() {
    const { t } = useI18n();

    return (
        <div className="flex h-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                    <Scissors className="h-5 w-5 text-accent" />
                </span>
                <p className="text-sm text-muted-foreground">{t('Chargement de votre espace…')}</p>
            </div>
        </div>
    );
}
