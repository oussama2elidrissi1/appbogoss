<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#081423">
    <meta name="description" content="BOGOSLAND Manager — la gestion complète de votre salon.">

    <title>BOGOSLAND Manager</title>

    <script>
        (function () {
            var stored = localStorage.getItem('bogosland-theme');
            var theme = stored === 'light' || stored === 'dark'
                ? stored
                : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
            document.documentElement.classList.toggle('dark', theme === 'dark');
            document.documentElement.style.colorScheme = theme;

            // Langue/RTL avant le premier paint (même principe que le thème)
            // — évite le "flash" gauche→droite quand l'arabe est actif.
            var lang = localStorage.getItem('bogosland-lang') === 'ar' ? 'ar' : 'fr';
            document.documentElement.lang = lang;
            document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        })();
    </script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    {{-- Tajawal couvre l'arabe : placé APRÈS Inter dans la pile de polices,
         il ne sert que pour les glyphes arabes (Inter n'en a pas). --}}
    {{-- Non bloquant : display=swap affiche déjà la police de secours en
         attendant ; la feuille Google n'a donc pas à retarder le 1er affichage. --}}
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
    <noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet"></noscript>

    @viteReactRefresh
    @vite('resources/js/main.tsx')
</head>
<body class="bg-background antialiased">
    {{-- Écran de chargement affiché dès l'arrivée du HTML, remplacé par React
         au premier rendu (même visuel que RouteFallback). --}}
    <div id="root">
        <div role="status" aria-busy="true" class="flex h-screen items-center justify-center bg-background">
            <span class="flex h-12 w-12 animate-pulse items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                <svg class="h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>
            </span>
        </div>
    </div>
</body>
</html>
