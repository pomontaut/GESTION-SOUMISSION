/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          from: '#4f46e5',
          to: '#06b6d4',
        },
      },
    },
  },
  plugins: [],
}
