import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { navItems } from '@/lib/navigation';
import Agenda from '@/pages/Agenda';
import Caisse from '@/pages/Caisse';
import Clients from '@/pages/Clients';
import Dashboard from '@/pages/Dashboard';
import Depenses from '@/pages/Depenses';
import Employees from '@/pages/Employees';
import Login from '@/pages/Login';
import PlaceholderPage from '@/pages/PlaceholderPage';
import Reports from '@/pages/Reports';
import Services from '@/pages/Services';
import Settings from '@/pages/Settings';

/** Nav destinations backed by a real screen; everything else is a placeholder. */
const realRoutes = new Set([
    '/dashboard',
    '/agenda',
    '/pos',
    '/expenses',
    '/employees',
    '/clients',
    '/services',
    '/reports',
    '/settings',
]);
const placeholderItems = navItems.filter((item) => !realRoutes.has(item.to));

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/agenda" element={<Agenda />} />
                    <Route path="/pos" element={<Caisse />} />
                    <Route path="/expenses" element={<Depenses />} />
                    <Route path="/employees" element={<Employees />} />
                    <Route path="/clients" element={<Clients />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/reports" element={<Reports />} />
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

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}
