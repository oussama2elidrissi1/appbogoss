import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import {
    BarChart3,
    CalendarDays,
    ChevronDown,
    CreditCard,
    FileText,
    Headphones,
    LayoutDashboard,
    LogOut,
    Menu,
    QrCode,
    ReceiptText,
    ScanLine,
    Star,
    UserRound,
    UsersRound,
    WalletCards,
    type LucideIcon,
} from 'lucide-react';
import { NotificationsBell } from '@/components/layout/NotificationsBell';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn, getInitials } from '@/lib/utils';

const employeeNav = [
    { section: 'Mon espace', items: [
        { label: 'Mon espace', to: '/mon-espace', icon: LayoutDashboard },
        { label: 'Mes prestations', to: '/employee/prestations', icon: ReceiptText },
        { label: 'Mon agenda', to: '/employee/agenda', icon: CalendarDays },
        { label: 'Mes commissions', to: '/employee/commissions', icon: WalletCards },
        { label: 'Mes paiements', to: '/employee/payments', icon: CreditCard },
        { label: 'Mes clients', to: '/employee/clients', icon: UsersRound },
        { label: 'Mes statistiques', to: '/employee/statistics', icon: BarChart3 },
        { label: 'Mes avis', to: '/employee/reviews', icon: Star },
    ] },
    { section: 'Outils', items: [
        { label: 'Scanner QR', to: '/employee/scanner', icon: ScanLine },
        { label: 'Mes documents', to: '/employee/documents', icon: FileText },
        { label: 'Support', to: '/employee/support', icon: Headphones },
    ] },
];

const mobileNav = [
    { label: 'Accueil', to: '/mon-espace', icon: LayoutDashboard },
    { label: 'Agenda', to: '/employee/agenda', icon: CalendarDays },
    { label: 'Scanner', to: '/employee/scanner', icon: QrCode, primary: true },
    { label: 'Prestations', to: '/employee/prestations', icon: ReceiptText },
    { label: 'Profil', to: '/settings', icon: UserRound },
];

export function EmployeeLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    async function handleLogout() {
        await logout();
        navigate('/login', { replace: true });
    }

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!mobileMenuOpen) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileMenuOpen(false);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mobileMenuOpen]);

    return (
        <div className="min-h-screen max-w-full overflow-x-hidden bg-[#050913] text-white">
            <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,rgba(200,162,76,0.12),transparent_28%),radial-gradient(circle_at_84%_8%,rgba(37,99,235,0.13),transparent_32%)]" />
            <div className="relative flex h-[100dvh] max-w-full overflow-hidden">
                <aside className="hidden w-[280px] shrink-0 border-r border-white/[0.07] bg-[#07101d]/95 lg:flex lg:flex-col">
                    <div className="flex h-20 items-center gap-3 px-6">
                        <span className="flex h-11 w-11 items-center justify-center rounded-md border border-[#c8a24c]/30 bg-[#c8a24c]/15">
                            <QrCode className="h-5 w-5 text-[#d5b15d]" />
                        </span>
                        <div>
                            <p className="text-[15px] font-semibold leading-none">BOGOSLAND</p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c8a24c]">
                                Manager
                            </p>
                        </div>
                    </div>

                    <nav className="flex-1 overflow-y-auto px-4 py-4">
                        {employeeNav.map((group) => (
                            <div key={group.section} className="mb-7">
                                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">
                                    {group.section}
                                </p>
                                <div className="space-y-1">
                                    {group.items.map((item) => (
                                        <EmployeeNavLink key={item.to} item={item} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </nav>

                    <div className="border-t border-white/[0.07] p-4">
                        <div className="rounded-md border border-white/[0.07] bg-white/[0.035] p-3">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-[#c8a24c]/30">
                                    <AvatarFallback className="bg-[#c8a24c]/20 text-[#f4d37a]">
                                        {user ? getInitials(user.employee_name ?? user.name) : '--'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{user?.employee_name ?? user?.name}</p>
                                    <p className="truncate text-xs text-white/52">Employe</p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                className="mt-3 w-full justify-start text-white/65 hover:bg-red-500/10 hover:text-red-300"
                                onClick={() => void handleLogout()}
                            >
                                <LogOut />
                                Deconnexion
                            </Button>
                        </div>
                    </div>
                </aside>

                {mobileMenuOpen && (
                    <button
                        type="button"
                        aria-label="Fermer le menu"
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                )}
                <motion.aside
                    initial={false}
                    animate={{ x: mobileMenuOpen ? 0 : '-100%' }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col border-r border-white/[0.07] bg-[#07101d] shadow-[0_24px_80px_rgba(0,0,0,0.45)] lg:hidden"
                >
                    <div className="flex h-16 items-center gap-3 border-b border-white/[0.07] px-4">
                        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[#c8a24c]/30 bg-[#c8a24c]/15">
                            <QrCode className="h-5 w-5 text-[#d5b15d]" />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">BOGOSLAND</p>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c8a24c]">Manager</p>
                        </div>
                    </div>
                    <nav className="flex-1 overflow-y-auto px-3 py-4">
                        {employeeNav.map((group) => (
                            <div key={group.section} className="mb-6">
                                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">{group.section}</p>
                                <div className="space-y-1">
                                    {group.items.map((item) => (
                                        <EmployeeNavLink key={item.to} item={item} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </nav>
                    <div className="border-t border-white/[0.07] p-3">
                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full justify-start text-white/65 hover:bg-red-500/10 hover:text-red-300"
                            onClick={() => void handleLogout()}
                        >
                            <LogOut />
                            Deconnexion
                        </Button>
                    </div>
                </motion.aside>

                <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
                    <EmployeeHeader onOpenMenu={() => setMobileMenuOpen(true)} />
                    <main className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-5">
                        <Outlet />
                    </main>
                    <MobileBottomNav />
                </div>
            </div>
        </div>
    );
}

function EmployeeHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
    const { user } = useAuth();
    const now = new Date();

    return (
        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#050913]/86 px-3 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
                <button
                    type="button"
                    aria-label="Ouvrir le menu"
                    className="rounded-md border border-white/[0.08] bg-white/[0.04] p-2 text-white/72 lg:hidden"
                    onClick={onOpenMenu}
                >
                    <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-base font-semibold tracking-tight sm:text-xl">
                        Bonjour {user?.employee_name ?? user?.name ?? ''}
                    </h1>
                    <p className="mt-0.5 hidden text-sm text-white/52 sm:block">
                        Voici un apercu de votre activite aujourd'hui.
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <div className="hidden rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/68 md:block">
                        {new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }).format(now)}
                    </div>
                    <NotificationsBell />
                    <button className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.04] p-1.5 text-sm sm:pr-2">
                        <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-[#c8a24c]/20 text-[#f4d37a]">
                                {user ? getInitials(user.employee_name ?? user.name) : '--'}
                            </AvatarFallback>
                        </Avatar>
                        <span className="hidden max-w-28 truncate sm:block">{user?.employee_name ?? user?.name}</span>
                        <ChevronDown className="hidden h-4 w-4 text-white/45 sm:block" />
                    </button>
                </div>
            </div>
        </header>
    );
}

function EmployeeNavLink({ item }: { item: { label: string; to: string; icon: LucideIcon } }) {
    const location = useLocation();
    const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    const Icon = item.icon;

    return (
        <NavLink
            to={item.to}
            className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all',
                active
                    ? 'bg-[#c8a24c]/13 text-white shadow-[inset_2px_0_0_#c8a24c]'
                    : 'text-white/58 hover:bg-white/[0.045] hover:text-white',
            )}
        >
            <Icon className={cn('h-[18px] w-[18px]', active ? 'text-[#d5b15d]' : 'text-white/45 group-hover:text-white/75')} />
            {item.label}
        </NavLink>
    );
}

function MobileBottomNav() {
    const location = useLocation();

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#06101d]/95 px-2 pb-2 pt-1 backdrop-blur-xl lg:hidden">
            <div className="grid grid-cols-5 items-end gap-1">
                {mobileNav.map((item) => {
                    const Icon = item.icon;
                    const active = location.pathname === item.to;
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={cn(
                                'flex min-h-14 flex-col items-center justify-center rounded-md text-[10px] font-medium transition',
                                item.primary && '-mt-5 min-h-16 border border-[#c8a24c]/35 bg-[#c8a24c] text-[#07101d] shadow-[0_12px_30px_rgba(200,162,76,0.25)]',
                                !item.primary && (active ? 'text-[#d5b15d]' : 'text-white/55'),
                            )}
                        >
                            <Icon className="mb-1 h-5 w-5" />
                            <span className="truncate">{item.label}</span>
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
}

export function EmployeePageShell({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            className={cn('mx-auto w-full max-w-[1500px] space-y-4 overflow-x-hidden sm:space-y-5', className)}
        >
            {children}
        </motion.div>
    );
}

export function EmployeePanel({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('max-w-full overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.045] shadow-[0_18px_60px_rgba(0,0,0,0.22)]', className)}>
            {children}
        </div>
    );
}

export function EmployeePanelTitle({ icon: Icon, title, action }: { icon?: LucideIcon; title: string; action?: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
            <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                {Icon && <Icon className="h-4 w-4 text-[#d5b15d]" />}
                <span className="truncate">{title}</span>
            </h2>
            {action}
        </div>
    );
}
