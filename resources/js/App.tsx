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
import Employees from '@/pages/Employees';
import Login from '@/pages/Login';
import MonEspace from '@/pages/MonEspace';
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

            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    <Route index element={<RoleAwareRedirect />} />
                    <Route path="/mon-espace" element={<MonEspace />} />
                    <Route path="/settings" element={<Settings />} />

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

            {/* Company-wide / management screens — every employee's account lacks
                these permissions, so they never render for a plain employee, in the
                UI or via a direct URL. */}
            <Route element={<ProtectedRoute permission="reports.view_all" />}>
                <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/reports" element={<Reports />} />
                </Route>
            </Route>

            <Route element={<ProtectedRoute permission="agenda.manage" />}>
                <Route element={<AppLayout />}>
                    <Route path="/agenda" element={<Agenda />} />
                </Route>
            </Route>

            <Route element={<ProtectedRoute permission="caisse.manage" />}>
                <Route element={<AppLayout />}>
                    <Route path="/pos" element={<Caisse />} />
                    <Route path="/expenses" element={<Depenses />} />
                    <Route path="/stock" element={<Stock />} />
                    <Route path="/clients" element={<Clients />} />
                </Route>
            </Route>

            <Route element={<ProtectedRoute permission="employees.manage" />}>
                <Route element={<AppLayout />}>
                    <Route path="/employees" element={<Employees />} />
                </Route>
            </Route>

            <Route element={<ProtectedRoute permission="services.manage" />}>
                <Route element={<AppLayout />}>
                    <Route path="/services" element={<Services />} />
                </Route>
            </Route>

            <Route element={<ProtectedRoute permission="activity_log.view" />}>
                <Route element={<AppLayout />}>
                    <Route path="/activity-log" element={<ActivityLog />} />
                </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
