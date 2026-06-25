import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        pos: {
          bg: '#F7F8FC',
          surface: '#FFFFFF',
          card: '#FFFFFF',
          border: '#E2E8F0',
          hover: '#F1F5F9',
          muted: '#94A3B8',
          text: '#1E293B',
          subtext: '#64748B',
        },
        brand: {
          DEFAULT: '#F59E0B',
          dark: '#D97706',
          light: '#FEF3C7',
          lighter: '#FFFBEB',
        },
        admin: {
          sidebar: '#1E293B',
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
        },
      },
      animation: {
        'slide-up': 'slide-up 0.2s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
      },
      keyframes: {
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
