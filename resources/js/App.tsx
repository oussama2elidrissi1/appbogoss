import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RoleAwareRedirect } from '@/components/RoleAwareRedirect';
import { navItems } from '@/lib/navigation';
import Abonnements from '@/pages/Abonnements';
import ActivityLog from '@/pages/ActivityLog';
import Agenda from '@/pages/Agenda';
import Caisse from '@/pages/Caisse';
import ClientDetail from '@/pages/ClientDetail';
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
import Partenaires from '@/pages/Partenaires';
import PartnerDetail from '@/pages/PartnerDetail';
import PartnerCommissionsAdmin from '@/pages/PartnerCommissionsAdmin';
import PartnerReservationsReview from '@/pages/PartnerReservationsReview';
import SupportInbox from '@/pages/SupportInbox';
import PartnerLayout, { PartnerProtectedRoute } from '@/pages/partner/PartnerLayout';
import PartnerDashboard from '@/pages/partner/PartnerDashboard';
import PartnerAgenda from '@/pages/partner/PartnerAgenda';
import PartnerNewReservation from '@/pages/partner/PartnerNewReservation';
import PartnerReservations from '@/pages/partner/PartnerReservations';
import PartnerReservationDetail from '@/pages/partner/PartnerReservationDetail';
import PartnerCommissions from '@/pages/partner/PartnerCommissions';
import PartnerClients from '@/pages/partner/PartnerClients';
import PartnerClientDetail from '@/pages/partner/PartnerClientDetail';
import PartnerProfile from '@/pages/partner/PartnerProfile';
import PartnerSupport from '@/pages/partner/PartnerSupport';
import MonthlyClosures from '@/pages/MonthlyClosures';
import Payroll from '@/pages/Payroll';
import PlaceholderPage from '@/pages/PlaceholderPage';
import PosV2 from '@/pages/pos2/PosV2';
import PosV2History from '@/pages/pos2/PosV2History';
import Reports from '@/pages/Reports';
import ScannerAbonnements from '@/pages/ScannerAbonnements';
import Services from '@/pages/Services';
import Stock from '@/pages/Stock';
import Settings from '@/pages/Settings';
import SubscriptionPlans from '@/pages/SubscriptionPlans';
import EmployeeAgenda from '@/pages/employee/EmployeeAgenda';
import EmployeeClients from '@/pages/employee/EmployeeClients';
import EmployeeCommissions from '@/pages/employee/EmployeeCommissions';
import EmployeeDashboard from '@/pages/employee/EmployeeDashboard';
import EmployeeDocuments from '@/pages/employee/EmployeeDocuments';
import EmployeePayments from '@/pages/employee/EmployeePayments';
import EmployeePrestations from '@/pages/employee/EmployeePrestations';
import EmployeeReviews from '@/pages/employee/EmployeeReviews';
import EmployeeStatistics from '@/pages/employee/EmployeeStatistics';
import EmployeeSupport from '@/pages/employee/EmployeeSupport';

/** Nav destinations backed by a real screen; everything else is a placeholder. */
const realRoutes = new Set([
    '/dashboard',
    '/agenda',
    '/pos',
    '/expenses',
    '/mon-espace',
    '/partenaires',
    '/partner-commissions',
    '/partner-reservations',
    '/support-inbox',
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
    '/abonnements',
    '/scanner-abonnements',
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

            {/* BOGOSLAND Partner Portal — a dedicated branded shell for external
                business partners, separate from the staff AppLayout. Reuses the
                same session/auth as staff (Partner.user_id → User), just gated
                on the account having a linked Partner record instead of a
                staff permission. */}
            <Route element={<PartnerProtectedRoute />}>
                <Route element={<PartnerLayout />}>
                    <Route path="/partner/dashboard" element={<PartnerDashboard />} />
                    <Route path="/partner/reservations/new" element={<PartnerNewReservation />} />
                    <Route path="/partner/reservations" element={<PartnerReservations />} />
                    <Route path="/partner/reservations/:id" element={<PartnerReservationDetail />} />
                    <Route path="/partner/agenda" element={<PartnerAgenda />} />
                    <Route path="/partner/commissions" element={<PartnerCommissions />} />
                    <Route path="/partner/clients" element={<PartnerClients />} />
                    <Route path="/partner/clients/:id" element={<PartnerClientDetail />} />
                    <Route path="/partner/profile" element={<PartnerProfile />} />
                    <Route path="/partner/support" element={<PartnerSupport />} />
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
                    <Route path="/mon-espace" element={<EmployeeDashboard />} />
                    <Route path="/employee/prestations" element={<EmployeePrestations />} />
                    <Route path="/employee/agenda" element={<EmployeeAgenda />} />
                    <Route path="/employee/commissions" element={<EmployeeCommissions />} />
                    <Route path="/employee/payments" element={<EmployeePayments />} />
                    <Route path="/employee/clients" element={<EmployeeClients />} />
                    <Route path="/employee/statistics" element={<EmployeeStatistics />} />
                    <Route path="/employee/reviews" element={<EmployeeReviews />} />
                    <Route path="/employee/scanner" element={<ScannerAbonnements />} />
                    <Route path="/employee/documents" element={<EmployeeDocuments />} />
                    <Route path="/employee/support" element={<EmployeeSupport />} />
                    <Route path="/settings" element={<Settings />} />

                    <Route element={<ProtectedRoute permission="reports.view_all" />}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/reports" element={<Reports />} />
                    </Route>

                    <Route element={<ProtectedRoute permission={['agenda.manage', 'agenda.partner']} />}>
                        <Route path="/agenda" element={<Agenda />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="partners.manage" />}>
                        <Route path="/partenaires" element={<Partenaires />} />
                        <Route path="/partenaires/:id" element={<PartnerDetail />} />
                        <Route path="/partner-commissions" element={<PartnerCommissionsAdmin />} />
                        <Route path="/partner-reservations" element={<PartnerReservationsReview />} />
                        <Route path="/support-inbox" element={<SupportInbox />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="caisse.manage" />}>
                        {/* Ancienne caisse (V1) : retirée du menu, gardée
                            joignable par URL le temps de la bascule. */}
                        <Route path="/pos-v1" element={<Caisse />} />
                        <Route path="/expenses" element={<Depenses />} />
                        <Route path="/stock" element={<Stock />} />
                        <Route path="/clients" element={<Clients />} />
                        <Route path="/clients/:id" element={<ClientDetail />} />
                    </Route>

                    {/* La caisse : validée, elle occupe /pos et pilote tout le
                        cycle (ouverture, factures, encaissement, clôture).
                        Les anciennes URL /pos-v2 restent redirigées. */}
                    <Route element={<ProtectedRoute permission="caisse_v2.access" />}>
                        <Route path="/pos" element={<PosV2 />} />
                        <Route path="/pos/historique" element={<PosV2History />} />
                        <Route path="/pos-v2" element={<Navigate to="/pos" replace />} />
                        <Route path="/pos-v2/historique" element={<Navigate to="/pos/historique" replace />} />
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
                        <Route path="/clotures" element={<MonthlyClosures />} />
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

                    <Route element={<ProtectedRoute permission="subscriptions.view" />}>
                        <Route path="/abonnements" element={<Abonnements />} />
                    </Route>

                    <Route element={<ProtectedRoute permission="subscriptions.use" />}>
                        <Route path="/scanner-abonnements" element={<ScannerAbonnements />} />
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
