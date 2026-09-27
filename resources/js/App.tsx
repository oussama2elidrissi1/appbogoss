import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RoleAwareRedirect } from '@/components/RoleAwareRedirect';
import { navItems } from '@/lib/navigation';
import { RouteFallback } from '@/components/RouteFallback';

// Every screen is its own chunk: the login page (the only one most
// visitors hit cold) no longer downloads the POS, agenda, charts, QR
// scanner… Layouts wrap their <Outlet /> in <Suspense>, so moving
// between pages keeps the sidebar/topbar on screen.
const AppLayout = lazy(() => import('@/components/layout/AppLayout').then((m) => ({ default: m.AppLayout })));
const Abonnements = lazy(() => import('@/pages/Abonnements'));
const ActivityLog = lazy(() => import('@/pages/ActivityLog'));
const Agenda = lazy(() => import('@/pages/Agenda'));
const Caisse = lazy(() => import('@/pages/Caisse'));
const ClientDetail = lazy(() => import('@/pages/ClientDetail'));
const Clients = lazy(() => import('@/pages/Clients'));
const Comptes = lazy(() => import('@/pages/Comptes'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Depenses = lazy(() => import('@/pages/Depenses'));
const EmployeeDetail = lazy(() => import('@/pages/EmployeeDetail'));
const Employees = lazy(() => import('@/pages/Employees'));
const Join = lazy(() => import('@/pages/Join'));
const Login = lazy(() => import('@/pages/Login'));
const LoyaltyPrograms = lazy(() => import('@/pages/LoyaltyPrograms'));
const LoyaltyQr = lazy(() => import('@/pages/LoyaltyQr'));
const LoyaltyQrDisplay = lazy(() => import('@/pages/LoyaltyQrDisplay'));
const LoyaltySettings = lazy(() => import('@/pages/LoyaltySettings'));
const PortalLayout = lazy(() => import('@/pages/portal/PortalLayout'));
const PortalProtectedRoute = lazy(() => import('@/pages/portal/PortalLayout').then((m) => ({ default: m.PortalProtectedRoute })));
const PortalLogin = lazy(() => import('@/pages/portal/PortalLogin'));
const PortalHome = lazy(() => import('@/pages/portal/PortalHome'));
const PortalRewards = lazy(() => import('@/pages/portal/PortalRewards'));
const PortalSubscriptions = lazy(() => import('@/pages/portal/PortalSubscriptions'));
const Partenaires = lazy(() => import('@/pages/Partenaires'));
const PartnerDetail = lazy(() => import('@/pages/PartnerDetail'));
const PartnerCommissionsAdmin = lazy(() => import('@/pages/PartnerCommissionsAdmin'));
const PartnerReservationsReview = lazy(() => import('@/pages/PartnerReservationsReview'));
const SupportInbox = lazy(() => import('@/pages/SupportInbox'));
const PartnerLayout = lazy(() => import('@/pages/partner/PartnerLayout'));
const PartnerProtectedRoute = lazy(() => import('@/pages/partner/PartnerLayout').then((m) => ({ default: m.PartnerProtectedRoute })));
const PartnerDashboard = lazy(() => import('@/pages/partner/PartnerDashboard'));
const PartnerAgenda = lazy(() => import('@/pages/partner/PartnerAgenda'));
const PartnerNewReservation = lazy(() => import('@/pages/partner/PartnerNewReservation'));
const PartnerReservations = lazy(() => import('@/pages/partner/PartnerReservations'));
const PartnerReservationDetail = lazy(() => import('@/pages/partner/PartnerReservationDetail'));
const PartnerCommissions = lazy(() => import('@/pages/partner/PartnerCommissions'));
const PartnerClients = lazy(() => import('@/pages/partner/PartnerClients'));
const PartnerClientDetail = lazy(() => import('@/pages/partner/PartnerClientDetail'));
const PartnerProfile = lazy(() => import('@/pages/partner/PartnerProfile'));
const PartnerSupport = lazy(() => import('@/pages/partner/PartnerSupport'));
const MonthClosure = lazy(() => import('@/pages/MonthClosure'));
const MonthlyClosures = lazy(() => import('@/pages/MonthlyClosures'));
const Payroll = lazy(() => import('@/pages/Payroll'));
const PlaceholderPage = lazy(() => import('@/pages/PlaceholderPage'));
const PartnerLanding = lazy(() => import('@/pages/PartnerLanding'));
const PartnerQr = lazy(() => import('@/pages/partner/PartnerQr'));
const PosSandbox = lazy(() => import('@/pages/pos2/PosSandbox'));
const ServicePacks = lazy(() => import('@/pages/ServicePacks'));
const SiteReservations = lazy(() => import('@/pages/SiteReservations'));
const PosV2 = lazy(() => import('@/pages/pos2/PosV2'));
const PosV2History = lazy(() => import('@/pages/pos2/PosV2History'));
const Reports = lazy(() => import('@/pages/Reports'));
const ScannerAbonnements = lazy(() => import('@/pages/ScannerAbonnements'));
const Services = lazy(() => import('@/pages/Services'));
const Stock = lazy(() => import('@/pages/Stock'));
const Settings = lazy(() => import('@/pages/Settings'));
const SubscriptionPlans = lazy(() => import('@/pages/SubscriptionPlans'));
const WalletPage = lazy(() => import('@/pages/Wallet'));
const WalletsOverview = lazy(() => import('@/pages/WalletsOverview'));
const EmployeeAgenda = lazy(() => import('@/pages/employee/EmployeeAgenda'));
const EmployeeClients = lazy(() => import('@/pages/employee/EmployeeClients'));
const EmployeeCommissions = lazy(() => import('@/pages/employee/EmployeeCommissions'));
const EmployeeDashboard = lazy(() => import('@/pages/employee/EmployeeDashboard'));
const EmployeeDocuments = lazy(() => import('@/pages/employee/EmployeeDocuments'));
const EmployeePayments = lazy(() => import('@/pages/employee/EmployeePayments'));
const EmployeePrestations = lazy(() => import('@/pages/employee/EmployeePrestations'));
const EmployeeReviews = lazy(() => import('@/pages/employee/EmployeeReviews'));
const EmployeeStatistics = lazy(() => import('@/pages/employee/EmployeeStatistics'));
const EmployeeSupport = lazy(() => import('@/pages/employee/EmployeeSupport'));

/** Nav destinations backed by a real screen; everything else is a placeholder. */
const realRoutes = new Set([
    '/dashboard',
    '/agenda',
    '/reservations-site',
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
        <Suspense fallback={<RouteFallback fullScreen />}>
            <Routes>
                <Route path="/login" element={<Login />} />

                {/* Public customer-facing surface — no staff auth, no AppLayout. Separate
                    `client` guard/session via PortalAuthProvider (see main.tsx). */}
                <Route path="/join" element={<Join />} />
                {/* QR partenaire : page publique, aucune authentification. Le
                    partenaire est deduit du jeton par le serveur. */}
                <Route path="/p/:token" element={<PartnerLanding />} />
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
                        <Route path="/partner/qr" element={<PartnerQr />} />
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

                        <Route element={<ProtectedRoute permission="agenda.manage" />}>
                            <Route path="/reservations-site" element={<SiteReservations />} />
                        </Route>

                        <Route element={<ProtectedRoute permission="partners.manage" />}>
                            <Route path="/partenaires" element={<Partenaires />} />
                            <Route path="/partenaires/:id" element={<PartnerDetail />} />
                            <Route path="/partner-commissions" element={<PartnerCommissionsAdmin />} />
                            <Route path="/packs" element={<ServicePacks />} />
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

                        {/* Caisse de test : le parcours complet, en memoire, sans
                            la moindre ecriture. Verrouillee sur le ROLE et non sur
                            une permission, que le super-admin satisfait toujours. */}
                        <Route element={<ProtectedRoute role="super-admin" />}>
                            <Route path="/caisse-test" element={<PosSandbox />} />
                        </Route>

                        <Route element={<ProtectedRoute permission="employees.manage" />}>
                            <Route path="/employees" element={<Employees />} />
                            <Route path="/employees/:id" element={<EmployeeDetail />} />
                        </Route>

                        <Route element={<ProtectedRoute permission="services.manage" />}>
                            <Route path="/services" element={<Services />} />
                        </Route>

                        {/* Portefeuille : l'admin voit le sien, le patron voit
                            tous les autres. Deux permissions distinctes, donc deux
                            gardes distinctes. */}
                        <Route element={<ProtectedRoute permission="wallet.view" />}>
                            <Route path="/wallet" element={<WalletPage />} />
                        </Route>

                        <Route element={<ProtectedRoute permission="wallet.view_all" />}>
                            <Route path="/tresorerie" element={<WalletsOverview />} />
                        </Route>

                        <Route element={<ProtectedRoute permission="commissions.manage" />}>
                            <Route path="/paie" element={<Payroll />} />
                            <Route path="/cloture" element={<MonthClosure />} />
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
        </Suspense>
    );
}
