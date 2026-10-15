import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0B2545', 600: '#13315C', 700: '#0B2545', 800: '#081A33' },
        brand: { DEFAULT: '#1E3A8A', 50: '#EEF2FB', 100: '#DCE4F6', 600: '#1E3A8A', 700: '#172E6E' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
