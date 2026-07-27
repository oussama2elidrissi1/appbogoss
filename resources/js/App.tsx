import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { navItems } from '@/lib/navigation';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import PlaceholderPage from '@/pages/PlaceholderPage';

/** Every nav destination except the dashboard renders a placeholder for now. */
const placeholderItems = navItems.filter((item) => item.to !== '/dashboard');

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />

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
