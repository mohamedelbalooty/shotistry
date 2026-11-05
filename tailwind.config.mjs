/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf8f3',
          100: '#f5eee3',
          200: '#ebdcbf',
          300: '#dfc699',
          400: '#d1ab6d',
          500: '#c59449',
          600: '#b0793c',
          700: '#8f5c32',
          800: '#754b2d',
          900: '#613e28',
          950: '#382114',
        },
        dark: {
          800: '#1e2025',
          850: '#18191d',
          900: '#121316',
          950: '#0b0c0e',
        }
      },
      fontFamily: {
        sans: ['Cairo', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

