import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
    darkMode: 'class',
    content: [
        './resources/**/*.blade.php',
        './resources/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                background: 'hsl(var(--background) / <alpha-value>)',
                foreground: 'hsl(var(--foreground) / <alpha-value>)',

                sidebar: {
                    DEFAULT: 'hsl(var(--sidebar) / <alpha-value>)',
                    foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)',
                },

                card: {
                    DEFAULT: 'hsl(var(--card) / <alpha-value>)',
                    foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
                },

                popover: {
                    DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
                    foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
                },

                primary: {
                    DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
                    foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
                },

                secondary: {
                    DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
                    foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
                },

                muted: {
                    DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
                    foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
                },

                accent: {
                    DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
                    foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
                },

                destructive: {
                    DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
                    foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
                },

                success: {
                    DEFAULT: 'hsl(var(--success) / <alpha-value>)',
                    foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
                },

                border: 'hsl(var(--border) / <alpha-value>)',
                input: 'hsl(var(--input) / <alpha-value>)',
                ring: 'hsl(var(--ring) / <alpha-value>)',

                /** Theme-relative wash — white in dark mode, near-black in light mode. Use for subtle panels/borders instead of a literal `white`. */
                tint: 'rgb(var(--tint-rgb) / <alpha-value>)',
                /** Always-dark scrim for modal/drawer backdrops, regardless of theme. */
                scrim: 'rgb(var(--scrim-rgb) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
            },
            borderRadius: {
                lg: '1rem',
                md: '0.75rem',
                sm: '0.5rem',
            },
            boxShadow: {
                soft: '0 1px 2px rgba(3, 8, 16, 0.4), 0 4px 12px rgba(3, 8, 16, 0.32)',
                'soft-lg':
                    '0 1px 2px rgba(3, 8, 16, 0.4), 0 8px 24px rgba(3, 8, 16, 0.38), 0 24px 48px rgba(3, 8, 16, 0.28)',
                glow: '0 0 0 1px rgba(200, 162, 76, 0.24), 0 8px 32px rgba(200, 162, 76, 0.14)',
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' },
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' },
                },
                shimmer: {
                    '100%': { transform: 'translateX(100%)' },
                },
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                shimmer: 'shimmer 1.8s infinite',
            },
        },
    },
    plugins: [animate],
} satisfies Config;
