import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { navItems } from '@/lib/navigation';
import Caisse from '@/pages/Caisse';
import Dashboard from '@/pages/Dashboard';
import Depenses from '@/pages/Depenses';
import Employees from '@/pages/Employees';
import Login from '@/pages/Login';
import PlaceholderPage from '@/pages/PlaceholderPage';
import Services from '@/pages/Services';

/** Nav destinations backed by a real screen; everything else is a placeholder. */
const realRoutes = new Set(['/dashboard', '/pos', '/expenses', '/employees', '/services']);
const placeholderItems = navItems.filter((item) => !realRoutes.has(item.to));

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/pos" element={<Caisse />} />
                    <Route path="/expenses" element={<Depenses />} />
                    <Route path="/employees" element={<Employees />} />
                    <Route path="/services" element={<Services />} />

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
