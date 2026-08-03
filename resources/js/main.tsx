import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import App from '@/App';
import '../css/app.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

const container = document.getElementById('root');

if (!container) {
    throw new Error('Élément racine #root introuvable.');
}

createRoot(container).render(
    <StrictMode>
        <ThemeProvider>
            <BrowserRouter>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <App />
                    </AuthProvider>
                </QueryClientProvider>
            </BrowserRouter>
        </ThemeProvider>
    </StrictMode>,
);
