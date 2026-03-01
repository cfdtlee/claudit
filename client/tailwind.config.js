/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        claude: {
          DEFAULT: '#d4915a',
          hover: '#c07e4a',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
