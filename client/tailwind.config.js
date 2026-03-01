/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        claude: {
          DEFAULT: '#DA7756',
          hover: '#C4623F',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
