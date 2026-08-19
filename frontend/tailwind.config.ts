import type { Config } from 'tailwindcss'

/**
 * Clinical workstation palette: deep navy surfaces, teal for AI activity,
 * restrained accents for speaker roles and review states.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f2f6fa',
          100: '#e2eaf3',
          200: '#c3d3e5',
          300: '#94b1cf',
          400: '#5d86b1',
          500: '#3c6795',
          600: '#2c507a',
          700: '#254163',
          800: '#1c3350',
          900: '#132339',
          950: '#0b1726',
        },
        teal: {
          50: '#effcf9',
          100: '#c7f5ec',
          200: '#94e9dc',
          300: '#5bd6c7',
          400: '#2fbcae',
          500: '#159f94',
          600: '#0d8078',
          700: '#0f6660',
          800: '#10514e',
          900: '#114341',
        },
        role: {
          doctor: '#2563eb',
          patient: '#0d9488',
          nurse: '#7c3aed',
          staff: '#b45309',
          background: '#64748b',
          unknown: '#94a3b8',
        },
        state: {
          live: '#e11d48',
          processing: '#d97706',
          ai: '#0d9488',
          review: '#b45309',
          approved: '#15803d',
          error: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(15, 35, 57, 0.06), 0 1px 3px rgba(15, 35, 57, 0.04)',
        raised: '0 4px 16px rgba(15, 35, 57, 0.10)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        'slide-in': 'slide-in 180ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config
