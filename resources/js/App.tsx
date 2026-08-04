import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RoleAwareRedirect } from '@/components/RoleAwareRedirect';
import { navItems } from '@/lib/navigation';
import ActivityLog from '@/pages/ActivityLog';
import Agenda from '@/pages/Agenda';
import Caisse from '@/pages/Caisse';
import Clients from '@/pages/Clients';
import Dashboard from '@/pages/Dashboard';
import Depenses from '@/pages/Depenses';
import EmployeeDetail from '@/pages/EmployeeDetail';
import Employees from '@/pages/Employees';
import Login from '@/pages/Login';
import MonEspace from '@/pages/MonEspace';
import Payroll from '@/pages/Payroll';
import PlaceholderPage from '@/pages/PlaceholderPage';
import Reports from '@/pages/Reports';
import Services from '@/pages/Services';
import Stock from '@/pages/Stock';
import Settings from '@/pages/Settings';

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
    '/stock',
    '/reports',
    '/settings',
    '/activity-log',
]);
const placeholderItems = navItems.filter((item) => !realRoutes.has(item.to));

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

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
