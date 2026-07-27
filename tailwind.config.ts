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
                background: '#081423',
                foreground: '#FFFFFF',

                sidebar: {
                    DEFAULT: '#0D1B2A',
                    foreground: '#94A3B8',
                },

                card: {
                    DEFAULT: '#132238',
                    foreground: '#FFFFFF',
                },

                popover: {
                    DEFAULT: '#16263F',
                    foreground: '#FFFFFF',
                },

                primary: {
                    DEFAULT: '#C8A24C',
                    foreground: '#081423',
                },

                secondary: {
                    DEFAULT: '#1B2E4A',
                    foreground: '#E2E8F0',
                },

                muted: {
                    DEFAULT: '#1B2E4A',
                    foreground: '#94A3B8',
                },

                accent: {
                    DEFAULT: '#C8A24C',
                    foreground: '#081423',
                    muted: 'rgba(200, 162, 76, 0.12)',
                },

                destructive: {
                    DEFAULT: '#E5484D',
                    foreground: '#FFFFFF',
                },

                success: {
                    DEFAULT: '#34D399',
                    foreground: '#08231A',
                },

                border: '#223449',
                input: '#223449',
                ring: '#C8A24C',
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
