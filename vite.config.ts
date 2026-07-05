import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// libraw-wasm ships its own Worker + wasm asset fetching (Emscripten glue),
// so no wasm/top-level-await plugins are needed here.
export default defineConfig(({ command }) => ({
  // GitHub Pages serves this as a project site at /lumix-raw-editor/, so
  // asset URLs need that prefix in production builds; dev server stays at root.
  base: command === 'build' ? '/lumix-raw-editor/' : '/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['libraw-wasm'],
  },
}));
