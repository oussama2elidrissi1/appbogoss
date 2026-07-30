import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Currency formatting for the app locale (fr-MA / MAD). */
export function formatCurrency(value: number, opts: Intl.NumberFormatOptions = {}) {
    return new Intl.NumberFormat('fr-MA', {
        style: 'currency',
        currency: 'MAD',
        maximumFractionDigits: 0,
        ...opts,
    }).format(value);
}

export function formatNumber(value: number) {
    return new Intl.NumberFormat('fr-FR').format(value);
}

/** 'HH:MM' from an ISO timestamp. */
export function formatTime(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '--:--';
    return new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

/** Short day label ('12 mars') from a 'YYYY-MM-DD' string. */
export function formatDayLabel(date: string) {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return date;
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d);
}

/** Localized date and time for entity detail cards. */
export function formatDate(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
}

/**
 * Compact relative time in French — "à l'instant", "il y a 5 min", "il y a 2 h", "il y a 3 j".
 * Hand-rolled on purpose: no extra dependency for this.
 */
export function formatRelativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';

    const seconds = Math.round((Date.now() - then) / 1000);

    if (seconds < 0) {
        const ahead = Math.abs(seconds);
        if (ahead < 60) return 'dans un instant';
        if (ahead < 3600) return `dans ${Math.round(ahead / 60)} min`;
        if (ahead < 86400) return `dans ${Math.round(ahead / 3600)} h`;
        return `dans ${Math.round(ahead / 86400)} j`;
    }

    if (seconds < 45) return "à l'instant";
    if (seconds < 3600) return `il y a ${Math.max(1, Math.round(seconds / 60))} min`;
    if (seconds < 86400) return `il y a ${Math.round(seconds / 3600)} h`;
    if (seconds < 604800) return `il y a ${Math.round(seconds / 86400)} j`;

    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
        new Date(then),
    );
}

/** Initials for avatar fallbacks — "Marie Dupont" -> "MD". */
export function getInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
}
