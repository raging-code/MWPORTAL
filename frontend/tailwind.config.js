/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mango: {
          50:  '#FFFBF0',
          100: '#FFF3CC',
          200: '#FFE680',
          300: '#FFD740',
          400: '#FFC107',
          500: '#F5C518',   // Primary brand yellow from logo
          600: '#D4A00A',
          700: '#A87800',
          800: '#7A5600',
          900: '#4D3500',
        },
        warrior: {
          50:  '#FFF5F5',
          100: '#FFE0DF',
          200: '#FFBBB9',
          300: '#FF8A87',
          400: '#F55F5A',
          500: '#E63329',   // Primary brand red from logo
          600: '#C4231A',
          700: '#9E1810',
          800: '#78100A',
          900: '#500A05',
        },
        forest: {
          50:  '#F0FAF3',
          100: '#D6F0DE',
          200: '#A8DEBA',
          300: '#6CC490',
          400: '#3AA866',
          500: '#1a5c2e',   // Logo leaf green
          600: '#144B24',
          700: '#0E3A1B',
          800: '#082912',
          900: '#04180A',
        },
        // Warm cream-tinted light surfaces (not cold grey)
        light: {
          50:  '#FFFFFF',
          100: '#FFFBF5',   // Warm cream page background
          200: '#F5EFE6',   // Warm card borders
          300: '#EAE0D2',   // Dividers
          400: '#D4C9B8',   // Disabled borders
          500: '#B8AA98',   // Placeholder
          600: '#8C7D6A',   // Muted text
          700: '#5C4F3D',   // Secondary text
          800: '#3A2E22',   // Body text
          900: '#1E1409',   // Headings
        }
      },
      fontFamily: {
        // DM Sans: clean, modern, highly readable — used for ALL UI text
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        // DM Mono: for timestamps, hour values, numeric data
        mono:    ['"DM Mono"', '"JetBrains Mono"', 'monospace'],
        // Display alias maps to sans (DM Sans handles headings too)
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      screens: {
        'xs': '375px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in':   'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },                                to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.95)' },      to: { opacity: '1', transform: 'scale(1)' } },
      }
    },
  },
  plugins: [],
}