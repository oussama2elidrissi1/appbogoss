import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
    CalendarCheck,
    CalendarPlus,
    LayoutDashboard,
    LifeBuoy,
    LogOut,
    Menu,
    Scissors,
    Users,
    UserCircle,
    Wallet,
    X,
    type LucideIcon,
} from 'lucide-react';
import { getPartnerPortalProfile } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { cn, getInitials } from '@/lib/utils';

interface PartnerNavItem {
    label: string;
    to: string;
    icon: LucideIcon;
    end?: boolean;
    highlight?: boolean;
    /** Sub-path(s) that must NOT count as "within" this item despite the prefix match. */
    excludePrefixes?: string[];
}

const NAV_ITEMS: PartnerNavItem[] = [
    { label: 'Tableau de bord', to: '/partner/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Nouvelle réservation', to: '/partner/reservations/new', icon: CalendarPlus, highlight: true },
    {
        label: 'Mes réservations',
        to: '/partner/reservations',
        icon: CalendarCheck,
        // The "new reservation" wizard has its own dedicated, highlighted
        // entry above — it shouldn't also light up this one just because
        // the URL happens to start with the same prefix.
        excludePrefixes: ['/partner/reservations/new'],
    },
    { label: 'Mes commissions', to: '/partner/commissions', icon: Wallet },
    { label: 'Mes clients', to: '/partner/clients', icon: Users },
    { label: 'Mon profil', to: '/partner/profile', icon: UserCircle },
    { label: 'Support', to: '/partner/support', icon: LifeBuoy },
];

/** Gates the whole /partner/* tree to an authenticated account with a Partner record. */
export function PartnerProtectedRoute() {
    const { user, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="dark flex min-h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                        <Scissors className="h-5 w-5 text-accent" />
                    </span>
                    <p className="text-sm text-muted-foreground">Chargement de votre espace…</p>
                </div>
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    if (!user.partner_id) return <Navigate to="/" replace />;

    return <Outlet />;
}

export default function PartnerLayout() {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    const { data: profile } = useQuery({
        queryKey: ['partner-portal', 'profile'],
        queryFn: getPartnerPortalProfile,
        staleTime: 60_000,
    });

    useEffect(() => {
        setMobileNavOpen(false);
    }, [location.pathname]);

    const displayName = profile?.trade_name || profile?.name || user?.partner_name || 'Partenaire';

    return (
        // Locked to the dark navy+gold palette regardless of the app's global
        // theme — the portal is meant to feel like a distinct, premium space
        // (§5/§23), and this reuses the exact tokens the rest of the app
        // already uses for dark mode, not a bespoke one-off palette.
        <div className="dark relative min-h-screen bg-background text-foreground">
            <div aria-hidden className="aurora pointer-events-none fixed inset-0 opacity-70" />

            <div className="relative flex min-h-screen">
                {/* Desktop sidebar */}
                <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-tint/[0.07] bg-sidebar/95 backdrop-blur lg:flex">
                    <PortalBrand />
                    <PortalNav />
                    <PortalFooter displayName={displayName} logoUrl={profile?.logo_url ?? null} onLogout={() => void logout()} />
                </aside>

                {/* Mobile drawer */}
                <AnimatePresence>
                    {mobileNavOpen && (
                        <>
                            <motion.div
                                key="backdrop"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                onClick={() => setMobileNavOpen(false)}
                                className="fixed inset-0 z-40 bg-scrim/70 backdrop-blur-sm lg:hidden"
                            />
                            <motion.aside
                                key="drawer"
                                initial={{ x: '-100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '-100%' }}
                                transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
                                className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-sidebar shadow-soft-lg lg:hidden"
                            >
                                <div className="flex items-center justify-between px-2">
                                    <PortalBrand />
                                    <button
                                        type="button"
                                        onClick={() => setMobileNavOpen(false)}
                                        aria-label="Fermer le menu"
                                        className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-tint/[0.06] hover:text-foreground"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                                <PortalNav />
                                <PortalFooter
                                    displayName={displayName}
                                    logoUrl={profile?.logo_url ?? null}
                                    onLogout={() => void logout()}
                                />
                            </motion.aside>
                        </>
                    )}
                </AnimatePresence>

                {/* Main column */}
                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-tint/[0.07] bg-background/80 px-4 backdrop-blur lg:hidden">
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="Ouvrir le menu"
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-tint/[0.06] hover:text-foreground"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                        <div className="text-sm font-semibold tracking-tight">
                            BOGOS<span className="text-accent">LAND</span>{' '}
                            <span className="text-muted-foreground">Partner</span>
                        </div>
                    </header>

                    <main className="relative flex-1">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                            className="mx-auto min-h-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
                        >
                            <Outlet />
                        </motion.div>
                    </main>
                </div>
            </div>
        </div>
    );
}

function PortalBrand() {
    return (
        <div className="flex h-20 items-center gap-3 px-6">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent/[0.14] ring-1 ring-accent/30">
                <Scissors className="h-[19px] w-[19px] text-accent" />
            </span>
            <div>
                <div className="text-[15px] font-semibold leading-none tracking-tight">
                    BOGOS<span className="text-accent">LAND</span>
                </div>
                <div className="mt-1.5 text-[10px] font-medium uppercase leading-none tracking-[0.18em] text-muted-foreground">
                    Espace Partenaire
                </div>
            </div>
        </div>
    );
}

function PortalNav() {
    const { pathname } = useLocation();

    return (
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                if (item.highlight) {
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className="group relative mb-1 flex items-center gap-3 overflow-hidden rounded-md bg-gradient-to-r from-accent/90 to-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground shadow-[0_0_0_1px_rgba(200,162,76,0.35),0_8px_24px_-8px_rgba(200,162,76,0.55)] transition-transform duration-200 hover:scale-[1.015]"
                        >
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                            <span className="truncate">{item.label}</span>
                        </NavLink>
                    );
                }

                const excluded = item.excludePrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false;
                const isActive =
                    !excluded &&
                    (pathname === item.to || (!item.end && pathname.startsWith(`${item.to}/`)));

                return (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={cn(
                            'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200',
                            isActive
                                ? 'bg-accent/[0.12] text-foreground'
                                : 'text-muted-foreground hover:bg-tint/[0.05] hover:text-foreground',
                        )}
                    >
                        {isActive && (
                            <motion.span
                                layoutId="partner-sidebar-active-rail"
                                transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                                className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                            />
                        )}
                        <Icon
                            className={cn(
                                'h-[18px] w-[18px] shrink-0 transition-colors duration-200',
                                isActive ? 'text-accent' : 'text-muted-foreground group-hover:text-foreground',
                            )}
                        />
                        <span className="truncate">{item.label}</span>
                    </NavLink>
                );
            })}
        </nav>
    );
}

function PortalFooter({
    displayName,
    logoUrl,
    onLogout,
}: {
    displayName: string;
    logoUrl: string | null;
    onLogout: () => void;
}) {
    return (
        <div className="border-t border-tint/[0.07] p-3">
            <div className="flex items-center gap-3 rounded-md px-2 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tint/[0.06] ring-1 ring-tint/10">
                    {logoUrl ? (
                        <img src={logoUrl} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                        <span className="text-xs font-semibold text-accent">{getInitials(displayName)}</span>
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight text-foreground">{displayName}</p>
                    <p className="truncate text-xs leading-tight text-muted-foreground">Compte partenaire</p>
                </div>
                <button
                    type="button"
                    onClick={onLogout}
                    aria-label="Déconnexion"
                    className="shrink-0 rounded-sm p-2 text-muted-foreground transition-colors duration-200 hover:bg-destructive/[0.12] hover:text-destructive"
                >
                    <LogOut className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
