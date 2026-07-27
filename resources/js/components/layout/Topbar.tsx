import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Search, Settings, User } from 'lucide-react';
import { getNavItemByPath } from '@/lib/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn, getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const current = getNavItemByPath(location.pathname);
    const title = current?.label ?? 'Dashboard';

    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    return (
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-white/[0.06] bg-background/80 px-4 backdrop-blur-xl lg:px-8">
            <button
                type="button"
                onClick={onOpenMobileNav}
                aria-label="Ouvrir le menu"
                className="rounded-sm p-2 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.05] hover:text-foreground lg:hidden"
            >
                <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
                    {title}
                </h1>
            </div>

            {/* Search — visual only for now */}
            <div className="relative hidden md:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <input
                    type="search"
                    placeholder="Rechercher..."
                    aria-label="Rechercher"
                    className={cn(
                        'h-10 w-56 rounded-md border border-white/[0.06] bg-white/[0.03] pl-9 pr-14 text-sm text-foreground',
                        'placeholder:text-muted-foreground/70 transition-all duration-200',
                        'hover:border-white/[0.12]',
                        'focus:w-72 focus:border-accent/50 focus:bg-white/[0.05] focus:outline-none focus:ring-4 focus:ring-accent/10',
                    )}
                />
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground lg:block">
                    ⌘K
                </kbd>
            </div>

            {/* Notifications — visual only for now */}
            <button
                type="button"
                aria-label="Notifications"
                className="relative rounded-md p-2.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.05] hover:text-foreground"
            >
                <Bell className="h-[18px] w-[18px]" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />
            </button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="flex items-center gap-2.5 rounded-md p-1 pr-2 transition-colors duration-200 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                        <Avatar className="h-8 w-8 ring-1 ring-white/10">
                            <AvatarFallback>{user ? getInitials(user.name) : '--'}</AvatarFallback>
                        </Avatar>
                        <span className="hidden text-sm font-medium text-foreground sm:block">
                            {user?.name ?? '—'}
                        </span>
                    </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium">{user?.name ?? '—'}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                                {user?.email ?? ''}
                            </span>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => navigate('/settings')}>
                        <User />
                        Profil
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate('/settings')}>
                        <Settings />
                        Paramètres
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void handleLogout()}>
                        <LogOut />
                        Déconnexion
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
}
