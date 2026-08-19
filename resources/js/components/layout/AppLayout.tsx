import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '@/hooks/useAuth';
import { EmployeeLayout } from '@/pages/employee/EmployeeLayout';

const COLLAPSED_STORAGE_KEY = 'bogosland:sidebar-collapsed';

function readCollapsedPreference(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function AppLayout() {
    const location = useLocation();
    const { user, hasPermission } = useAuth();
    const [collapsed, setCollapsed] = useState<boolean>(readCollapsedPreference);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const isEmployeeOnly =
        user?.employee_id != null &&
        !user?.partner_id &&
        ![
            'reports.view_all',
            'caisse.manage',
            'employees.manage',
            'partners.manage',
            'commissions.manage',
            'users.manage',
            'agenda.manage',
            'settings.manage',
        ].some(hasPermission);

    useEffect(() => {
        try {
            window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
        } catch {
            /* storage unavailable (private mode) — preference is non-critical */
        }
    }, [collapsed]);

    // Close the mobile drawer whenever the route changes.
    useEffect(() => {
        setMobileNavOpen(false);
    }, [location.pathname]);

    // Escape closes the mobile drawer.
    useEffect(() => {
        if (!mobileNavOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileNavOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mobileNavOpen]);

    if (isEmployeeOnly) {
        return (
            <TooltipProvider delayDuration={200} skipDelayDuration={300}>
                <EmployeeLayout />
            </TooltipProvider>
        );
    }

    return (
        <TooltipProvider delayDuration={200} skipDelayDuration={300}>
            <div className="flex h-[100dvh] max-w-full overflow-hidden bg-background">
                {/* Desktop sidebar */}
                <div className="hidden lg:block">
                    <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
                </div>

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
                            <motion.div
                                key="drawer"
                                initial={{ x: '-100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '-100%' }}
                                transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
                                className="fixed inset-y-0 left-0 z-50 shadow-soft-lg lg:hidden"
                            >
                                <Sidebar
                                    variant="mobile"
                                    collapsed={false}
                                    onToggle={() => setMobileNavOpen(false)}
                                    onNavigate={() => setMobileNavOpen(false)}
                                />
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Main column */}
                <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
                    <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />

                    <main className="flex-1 overflow-x-hidden overflow-y-auto">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                            className="min-h-full max-w-full px-3 py-4 sm:px-4 sm:py-6 lg:px-8 lg:py-8"
                        >
                            <Outlet />
                        </motion.div>
                    </main>
                </div>
            </div>
        </TooltipProvider>
    );
}
