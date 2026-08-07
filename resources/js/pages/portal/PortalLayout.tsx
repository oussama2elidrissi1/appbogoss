import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { CalendarClock, Gift, LogOut, Scissors, Sparkles } from 'lucide-react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { cn } from '@/lib/utils';

const tabs = [
    { to: '/mon-compte', label: 'Accueil', icon: Sparkles, end: true },
    { to: '/mon-compte/recompenses', label: 'Récompenses', icon: Gift, end: false },
    { to: '/mon-compte/abonnements', label: 'Abonnements', icon: CalendarClock, end: false },
];

export function PortalProtectedRoute() {
    const { client, isLoading } = usePortalAuth();

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                        <Scissors className="h-5 w-5 text-accent" />
                    </span>
                    <p className="text-sm text-muted-foreground">Chargement de votre espace…</p>
                </div>
            </div>
        );
    }

    if (!client) return <Navigate to="/mon-compte/connexion" replace />;

    return <Outlet />;
}

export default function PortalLayout() {
    const { client, logout } = usePortalAuth();
    const navigate = useNavigate();

    const onLogout = async () => {
        await logout();
        navigate('/mon-compte/connexion', { replace: true });
    };

    return (
        <div className="min-h-screen bg-background pb-20">
            <header className="border-b border-tint/[0.06] bg-card/50 px-5 py-4 backdrop-blur">
                <div className="mx-auto flex max-w-xl items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                            <Scissors className="h-4 w-4 text-accent" />
                        </span>
                        <div>
                            <div className="text-sm font-semibold leading-none tracking-tight">
                                BOGOS<span className="text-accent">LAND</span>
                            </div>
                            {client?.name && <div className="mt-1 text-xs text-muted-foreground">{client.name}</div>}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void onLogout()}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-tint/[0.05] hover:text-foreground"
                        aria-label="Déconnexion"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </header>

            <main className="mx-auto max-w-xl px-5 py-6">
                <Outlet />
            </main>

            <nav className="fixed inset-x-0 bottom-0 border-t border-tint/[0.06] bg-card/95 backdrop-blur">
                <div className="mx-auto flex max-w-xl items-stretch justify-around">
                    {tabs.map((tab) => (
                        <NavLink
                            key={tab.to}
                            to={tab.to}
                            end={tab.end}
                            className={({ isActive }) =>
                                cn(
                                    'flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
                                    isActive ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
                                )
                            }
                        >
                            <tab.icon className="h-5 w-5" />
                            {tab.label}
                        </NavLink>
                    ))}
                </div>
            </nav>
        </div>
    );
}
