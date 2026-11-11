import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          '"Noto Sans"',
          'sans-serif',
        ],
      },
      colors: {
        // Accent in the spirit of the briefing PDF. accent-600 is the headline teal;
        // accent-700/800 are used for text and links (AA on white).
        accent: {
          50: '#EEF8F9',
          100: '#D5EEF0',
          200: '#A9DCE0',
          300: '#76C4CA',
          500: '#0E97A2',
          600: '#00838F',
          700: '#006C76',
          800: '#00565E',
          900: '#0B3F45',
        },
        ink: {
          DEFAULT: '#1B2428',
          muted: '#4A575D',
          soft: '#5F6B71',
        },
        line: '#DDE3E5',
        paper: '#FBFCFC',
        cat: {
          gradea: '#00606B',
          modern: '#5DB7BF',
          special: '#37474F',
          land: '#9AA3A8',
        },
      },
      maxWidth: { page: '86rem' },
    },
  },
  plugins: [],
} satisfies Config;
