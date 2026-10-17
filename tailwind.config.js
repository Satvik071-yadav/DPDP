/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#060913',
        obsidian: {
          950: '#060913',
          900: '#0A0F1F',
          850: '#0E162B',
          800: '#131D38',
          750: '#192648',
          700: '#213159',
          600: '#2D437A',
        },
        surface: {
          DEFAULT: '#0E162B',
          hover: '#15213E',
          card: '#0A0F1F',
          active: '#192648',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-subtle': 'rgba(255, 255, 255, 0.04)',
          'border-hover': 'rgba(6, 182, 212, 0.35)',
        },
        primary: {
          DEFAULT: '#06B6D4',
          dark: '#0891B2',
          light: '#22D3EE',
          glow: 'rgba(6, 182, 212, 0.15)',
        },
        cyan: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        teal: {
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
        },
        violet: {
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          glow: 'rgba(139, 92, 246, 0.15)',
        },
        accent: {
          cyan: '#06B6D4',
          teal: '#14B8A6',
          violet: '#8B5CF6',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 4px 20px -2px rgba(0, 0, 0, 0.5)',
        'obsidian-card': '0 10px 30px -5px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.07)',
        'obsidian-card-hover': '0 16px 40px -5px rgba(0, 0, 0, 0.75), inset 0 1px 0 0 rgba(6, 182, 212, 0.25)',
        'cyan-glow': '0 0 25px -3px rgba(6, 182, 212, 0.25)',
        'cyan-sm': '0 0 15px rgba(6, 182, 212, 0.18)',
        'violet-glow': '0 0 25px -3px rgba(139, 92, 246, 0.25)',
        'emerald-glow': '0 0 20px -3px rgba(16, 185, 129, 0.25)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
}
