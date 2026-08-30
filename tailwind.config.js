/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf2f4',
          100: '#fce7ea',
          200: '#f9d0d6',
          300: '#f4aab5',
          400: '#ed7a8c',
          500: '#e14c66',
          600: '#c42d4d',
          700: '#a5213f',
          800: '#8a1f3b',
          900: '#771e38',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};