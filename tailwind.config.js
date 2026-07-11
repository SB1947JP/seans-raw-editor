/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Named first so every browser renders the same embedded webfont
      // (see index.html) instead of falling back to whatever generic
      // system-ui/sans-serif substitution the browser's own font settings
      // apply. The rest of the stack is just the safety net if it fails to load.
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
