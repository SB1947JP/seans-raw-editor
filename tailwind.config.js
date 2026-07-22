/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Named first so every browser renders the same embedded webfont
      // (bundled via @fontsource-variable/inter in main.tsx) instead of
      // falling back to whatever generic system-ui/sans-serif substitution the
      // browser's own font settings apply. 'Inter Variable' is the family name
      // the self-hosted variable font declares; plain 'Inter' stays next in
      // line for anyone who happens to have it installed locally, and the rest
      // is just the safety net if neither loads.
      fontFamily: {
        sans: [
          'Inter Variable',
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
