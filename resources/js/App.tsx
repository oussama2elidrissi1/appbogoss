import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RoleAwareRedirect } from '@/components/RoleAwareRedirect';
import { navItems } from '@/lib/navigation';
import ActivityLog from '@/pages/ActivityLog';
import Agenda from '@/pages/Agenda';
import Caisse from '@/pages/Caisse';
import Clients from '@/pages/Clients';
import Comptes from '@/pages/Comptes';
import Dashboard from '@/pages/Dashboard';
import Depenses from '@/pages/Depenses';
import EmployeeDetail from '@/pages/EmployeeDetail';
import Employees from '@/pages/Employees';
import Join from '@/pages/Join';
import Login from '@/pages/Login';
import LoyaltyPrograms from '@/pages/LoyaltyPrograms';
import LoyaltyQr from '@/pages/LoyaltyQr';
import LoyaltyQrDisplay from '@/pages/LoyaltyQrDisplay';
import LoyaltySettings from '@/pages/LoyaltySettings';
import PortalLayout, { PortalProtectedRoute } from '@/pages/portal/PortalLayout';
import PortalLogin from '@/pages/portal/PortalLogin';
import PortalHome from '@/pages/portal/PortalHome';
import PortalRewards from '@/pages/portal/PortalRewards';
import PortalSubscriptions from '@/pages/portal/PortalSubscriptions';
import MonEspace from '@/pages/MonEspace';
import Payroll from '@/pages/Payroll';
import PlaceholderPage from '@/pages/PlaceholderPage';
import Reports from '@/pages/Reports';
import Services from '@/pages/Services';
import Stock from '@/pages/Stock';
import Settings from '@/pages/Settings';
import SubscriptionPlans from '@/pages/SubscriptionPlans';

/** Nav destinations backed by a real screen; everything else is a placeholder. */
const realRoutes = new Set([
    '/dashboard',
    '/agenda',
    '/pos',
    '/expenses',
    '/mon-espace',
    '/employees',
    '/clients',
    '/services',
    '/paie',
    '/comptes',
    '/stock',
    '/reports',
    '/settings',
    '/activity-log',
    '/loyalty-programs',
    '/subscription-plans',
    '/loyalty-qr',
    '/loyalty-settings',
]);
const placeholderItems = navItems.filter((item) => !realRoutes.has(item.to));

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            {/* Public customer-facing surface — no staff auth, no AppLayout. Separate
                `client` guard/session via PortalAuthProvider (see main.tsx). */}
            <Route path="/join" element={<Join />} />
            <Route path="/mon-compte/connexion" element={<PortalLogin />} />
            <Route element={<PortalProtectedRoute />}>
                <Route element={<PortalLayout />}>
                    <Route path="/mon-compte" element={<PortalHome />} />
                    <Route path="/mon-compte/recompenses" element={<PortalRewards />} />
                    <Route path="/mon-compte/abonnements" element={<PortalSubscriptions />} />
                </Route>
            </Route>

            {/* Full-screen digital-signage version of the registration QR —
                staff-gated but rendered OUTSIDE AppLayout (no sidebar/topbar,
                it's meant to fill a salon tablet/screen). */}
            <Route element={<ProtectedRoute permission="loyalty.qr.manage" />}>
                <Route path="/loyalty-qr/affichage" element={<LoyaltyQrDisplay />} />
            </Route>

            {/* Single persistent AppLayout for the whole authenticated app — the
                permission gates below are nested INSIDE it (not separate top-level
                route trees), so Sidebar/Topbar never remount when navigating across
                permission boundaries. A prior version used one <AppLayout> per
                permission group, which tore down and rebuilt the whole shell on
                every such navigation and could leave the page-transition animation
                stuck mid-flight. */}
            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    <Route index element={<RoleAwareRedirect />} />
                    <Route path="/mon-espace" element={<MonEspace />} />
                    <Route path="/settings" element={<Settings />} />

                    <Route element={<ProtectedRoute permission="reports.view_all" />}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/reports" element={<Reports />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="agenda.manage" />}>
                        <Route path="/agenda" element={<Agenda />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="caisse.manage" />}>
                        <Route path="/pos" element={<Caisse />} />
                        <Route path="/expenses" element={<Depenses />} />
                        <Route path="/stock" element={<Stock />} />
                        <Route path="/clients" element={<Clients />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="employees.manage" />}>
                        <Route path="/employees" element={<Employees />} />
                        <Route path="/employees/:id" element={<EmployeeDetail />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="services.manage" />}>
                        <Route path="/services" element={<Services />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="commissions.manage" />}>
                        <Route path="/paie" element={<Payroll />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="activity_log.view" />}>
                        <Route path="/activity-log" element={<ActivityLog />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="users.manage" />}>
                        <Route path="/comptes" element={<Comptes />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="loyalty.manage" />}>
                        <Route path="/loyalty-programs" element={<LoyaltyPrograms />} />
                        <Route path="/subscription-plans" element={<SubscriptionPlans />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="loyalty.qr.manage" />}>
                        <Route path="/loyalty-qr" element={<LoyaltyQr />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="loyalty.settings.manage" />}>
                        <Route path="/loyalty-settings" element={<LoyaltySettings />} />
                    </Route>

                    {placeholderItems.map((item) => (
                        <Route
                            key={item.to}
                            path={item.to}
                            element={
                                <PlaceholderPage
                                    title={item.label}
                                    icon={item.icon}
                                    description={item.description}
                                />
                            }
                        />
                    ))}
                </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
