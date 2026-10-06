/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#10212b',
        paper: '#f3f6f8',
        brand: { DEFAULT: '#0f5c78', dark: '#0a4258', light: '#e3f0f5' },
        pending: '#c62828', progress: '#c98400', done: '#2e7d32',
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Public Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
