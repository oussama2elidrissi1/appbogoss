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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/main.tsx'])
</head>
<body class="bg-background antialiased">
    <div id="root"></div>
</body>
</html>
