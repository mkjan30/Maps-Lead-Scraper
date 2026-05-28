/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-from-bottom-2': { from: { transform: 'translateY(8px)' }, to: { transform: 'translateY(0)' } },
      },
      animation: {
        'in': 'fade-in 0.15s ease-out, slide-in-from-bottom-2 0.15s ease-out',
      },
    },
  },
  plugins: [],
};
