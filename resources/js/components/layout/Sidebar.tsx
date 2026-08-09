import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, LogOut, Scissors } from 'lucide-react';
import { navSections, type NavItem } from '@/lib/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getSettings } from '@/lib/api';
import { cn, getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const SIDEBAR_WIDTH = 264;
const SIDEBAR_WIDTH_COLLAPSED = 80;

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
    /** Mobile drawer renders always-expanded and closes on navigation. */
    variant?: 'desktop' | 'mobile';
    onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, variant = 'desktop', onNavigate }: SidebarProps) {
    const isMobile = variant === 'mobile';
    const isCollapsed = isMobile ? false : collapsed;
    const { user, logout, hasPermission } = useAuth();
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 5 * 60_000 });
    const location = useLocation();

    return (
        <motion.aside
            initial={false}
            animate={{ width: isMobile ? SIDEBAR_WIDTH : isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className="relative flex h-full shrink-0 flex-col border-r border-tint/[0.06] bg-sidebar"
        >
            {/* Brand */}
            <div
                className={cn(
                    'flex h-16 items-center gap-3 px-5',
                    isCollapsed && 'justify-center px-0',
                )}
            >
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                    {settings?.logo_url ? <img src={settings.logo_url} alt="Logo" className="h-full w-full object-contain p-1" /> : <Scissors className="h-[18px] w-[18px] text-accent" />}
                </span>

                <AnimatePresence initial={false}>
                    {!isCollapsed && (
                        <motion.div
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -6 }}
                            transition={{ duration: 0.16 }}
                            className="overflow-hidden whitespace-nowrap"
                        >
                            <div className="text-[15px] font-semibold leading-none tracking-tight text-foreground">
                                {settings?.salon_name ?? 'BOGOSLAND'}
                            </div>
                            <div className="mt-1 text-[10px] font-medium uppercase leading-none tracking-[0.16em] text-muted-foreground">
                                Manager
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-3 py-4">
                {navSections.map((section) => {
                    const visibleItems = section.items.filter(
                        (item) =>
                            (!item.permission ||
                                (Array.isArray(item.permission)
                                    ? item.permission.some(hasPermission)
                                    : hasPermission(item.permission))) &&
                            (!item.requiresEmployee || user?.employee_id !== null),
                    );

                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={section.heading} className="space-y-1">
                            <AnimatePresence initial={false}>
                                {!isCollapsed && (
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.16 }}
                                        className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60"
                                    >
                                        {section.heading}
                                    </motion.p>
                                )}
                            </AnimatePresence>

                            {visibleItems.map((item) => (
                                <SidebarLink
                                    key={item.to}
                                    item={item}
                                    collapsed={isCollapsed}
                                    active={
                                        location.pathname === item.to ||
                                        location.pathname.startsWith(`${item.to}/`)
                                    }
                                    onNavigate={onNavigate}
                                />
                            ))}
                        </div>
                    );
                })}
            </nav>

            {/* User + logout */}
            <div className="border-t border-tint/[0.06] p-3">
                <div
                    className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2',
                        isCollapsed && 'justify-center px-0',
                    )}
                >
                    <Avatar className="h-9 w-9 ring-1 ring-tint/10">
                        <AvatarFallback>{user ? getInitials(user.name) : '--'}</AvatarFallback>
                    </Avatar>

                    <AnimatePresence initial={false}>
                        {!isCollapsed && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.16 }}
                                className="min-w-0 flex-1 overflow-hidden"
                            >
                                <p className="truncate text-sm font-medium leading-tight text-foreground">
                                    {user?.name ?? '—'}
                                </p>
                                <p className="truncate text-xs capitalize leading-tight text-muted-foreground">
                                    {user?.role ?? ''}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {!isCollapsed && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={() => void logout()}
                                    aria-label="Déconnexion"
                                    className="shrink-0 rounded-sm p-2 text-muted-foreground transition-colors duration-200 hover:bg-destructive/[0.12] hover:text-destructive"
                                >
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Déconnexion</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                {isCollapsed && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => void logout()}
                                aria-label="Déconnexion"
                                className="mt-1 flex w-full items-center justify-center rounded-sm p-2 text-muted-foreground transition-colors duration-200 hover:bg-destructive/[0.12] hover:text-destructive"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Déconnexion</TooltipContent>
                    </Tooltip>
                )}
            </div>

            {/* Collapse handle — desktop only */}
            {!isMobile && (
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={isCollapsed ? 'Déplier le menu' : 'Replier le menu'}
                    className={cn(
                        'absolute -right-3 top-[72px] z-20 flex h-6 w-6 items-center justify-center rounded-full',
                        'border border-tint/10 bg-card text-muted-foreground shadow-soft',
                        'transition-all duration-200 hover:border-accent/40 hover:text-accent',
                    )}
                >
                    <ChevronLeft
                        className={cn(
                            'h-3.5 w-3.5 transition-transform duration-240',
                            isCollapsed && 'rotate-180',
                        )}
                    />
                </button>
            )}
        </motion.aside>
    );
}

function SidebarLink({
    item,
    collapsed,
    active,
    onNavigate,
}: {
    item: NavItem;
    collapsed: boolean;
    active: boolean;
    onNavigate?: () => void;
}) {
    const Icon = item.icon;

    const link = (
        <NavLink
            to={item.to}
            onClick={onNavigate}
            className={cn(
                'group relative flex items-center gap-3 rounded-md py-2.5 text-sm font-medium transition-all duration-200',
                collapsed ? 'justify-center px-0' : 'px-3',
                active
                    ? 'bg-accent/[0.10] text-foreground'
                    : 'text-muted-foreground hover:bg-tint/[0.04] hover:text-foreground',
            )}
        >
            {/* Active rail */}
            {active && (
                <motion.span
                    layoutId="sidebar-active-rail"
                    transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                />
            )}

            <Icon
                className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors duration-200',
                    active ? 'text-accent' : 'text-muted-foreground group-hover:text-foreground',
                )}
            />

            {!collapsed && <span className="truncate">{item.label}</span>}
        </NavLink>
    );

    if (!collapsed) return link;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
    );
}
