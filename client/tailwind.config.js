/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        clarity: {
          50:  '#f0f6f3', // Softest Sage Alabaster
          100: '#dcece4',
          200: '#bddbc9',
          300: '#97c5ad',
          400: '#74af91',
          500: '#67a387', // Primary Brand Sage Green
          600: '#52876e', // Hover Sage Green
          700: '#416b57',
          800: '#345546',
          900: '#294337',
          950: '#1d3027',
        },
        lavender: {
          50:  '#f7f4ff', // Soft Lavender Blush
          100: '#f0e8ff',
          200: '#e1d4ff',
          300: '#caaeff',
          400: '#ae82ff',
          500: '#9052f5',
          600: '#7737db',
        },
        sage: {
          50:  '#f3f7f5', // Pale Soft Sage
          100: '#e4ede9',
          200: '#cbdad2',
          300: '#a4beb0',
          400: '#759c88',
          500: '#547c69',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
