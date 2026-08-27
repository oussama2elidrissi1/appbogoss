import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import arDictionary from '@/i18n/ar';

/**
 * i18n BOGOSLAND — français (langue source) ↔ arabe.
 *
 * Principe « aucune information perdue » : les chaînes FRANÇAISES restent la
 * source dans le code ; `t()` cherche leur traduction dans le dictionnaire
 * arabe et, si elle manque, affiche le français tel quel. Une chaîne non
 * traduite ne disparaît donc jamais.
 *
 * - Composants React : `const { t, lang } = useI18n();` (re-render garanti
 *   au changement de langue).
 * - Modules hors React (tickets d'impression…) : importer `t` directement —
 *   il lit la langue courante au moment de l'appel.
 * - Interpolation : t('Page {n}', { n: 3 }).
 * - RTL : le provider pose `dir="rtl"` + `lang="ar"` sur <html>.
 */

export type Lang = 'fr' | 'ar';

const STORAGE_KEY = 'bogosland-lang';

function readInitialLang(): Lang {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'fr';
    } catch {
        return 'fr';
    }
}

let currentLang: Lang = readInitialLang();

const dictionary = arDictionary as Record<string, string>;

/** Langue courante — pour les modules hors React (documents imprimés : lang/dir). */
export function currentLanguage(): Lang {
    return currentLang;
}

/** Traduction brute d'une chaîne française (fallback : la chaîne elle-même). */
export function translate(text: string, lang: Lang = currentLang): string {
    if (lang !== 'ar') return text;
    return dictionary[text] ?? text;
}

/** Traduction + interpolation `{clé}` dans une langue explicite. */
function format(text: string, params: Record<string, string | number> | undefined, lang: Lang): string {
    let out = translate(text, lang);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            out = out.split(`{${key}}`).join(String(value));
        }
    }
    return out;
}

/** Traduction + interpolation `{clé}`. Utilisable hors React (langue courante). */
export function t(text: string, params?: Record<string, string | number>): string {
    return format(text, params, currentLang);
}

interface I18nContextValue {
    lang: Lang;
    dir: 'ltr' | 'rtl';
    setLang: (lang: Lang) => void;
    t: typeof t;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(readInitialLang);

    // Mise à jour SYNCHRONE de la langue globale, pendant le rendu du provider
    // (donc avant celui des enfants) : tout `t()` appelé dans ce même rendu —
    // y compris depuis les modules hors React — voit déjà la nouvelle langue.
    // Avec un useEffect (après le rendu), les textes restaient en français
    // jusqu'au rechargement de la page alors que le sens de lecture changeait.
    currentLang = lang;

    const setLang = useCallback((next: Lang) => {
        currentLang = next;
        setLangState(next);
    }, []);

    // `t` lié à la langue du contexte : ne dépend pas du global, et change
    // d'identité avec `lang` pour invalider les useMemo/useCallback qui en dépendent.
    const boundT = useCallback<typeof t>((text, params) => format(text, params, lang), [lang]);

    useEffect(() => {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        try {
            window.localStorage.setItem(STORAGE_KEY, lang);
        } catch {
            // Mode privé : la préférence ne survit pas au rechargement, sans plus.
        }
    }, [lang]);

    const value = useMemo<I18nContextValue>(
        () => ({ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, t: boundT }),
        [lang, setLang, boundT],
    );

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
    const context = useContext(I18nContext);
    if (!context) throw new Error('useI18n doit être utilisé dans <I18nProvider>.');
    return context;
}
