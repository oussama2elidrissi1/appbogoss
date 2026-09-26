import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { PortalAuthProvider } from '@/hooks/usePortalAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import { I18nProvider } from '@/lib/i18n';
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

// Chaque page est un fichier JS séparé (voir App.tsx). Après un déploiement,
// un onglet resté ouvert réclame des fichiers dont le nom haché n'existe plus :
// on recharge une fois pour récupérer la nouvelle version au lieu d'un écran
// vide. Le délai de 10 s empêche une boucle si le fichier manque vraiment.
window.addEventListener('vite:preloadError', (event) => {
    const key = 'bogosland-chunk-reload';
    try {
        if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 10_000) return;
        sessionStorage.setItem(key, String(Date.now()));
    } catch {
        return;
    }
    event.preventDefault();
    window.location.reload();
});

const container = document.getElementById('root');

if (!container) {
    throw new Error('Élément racine #root introuvable.');
}

createRoot(container).render(
    <StrictMode>
        <I18nProvider>
        <ThemeProvider>
            <BrowserRouter>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <PortalAuthProvider>
                            <App />
                        </PortalAuthProvider>
                    </AuthProvider>
                </QueryClientProvider>
            </BrowserRouter>
        </ThemeProvider>
        </I18nProvider>
    </StrictMode>,
);
