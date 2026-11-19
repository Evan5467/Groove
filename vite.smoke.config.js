import { defineConfig } from 'vite';

// Builds only the browser smoke-test page (scripts/smoke.mjs). Same settings as the app build.
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0, outDir: 'dist-smoke', emptyOutDir: true, chunkSizeWarningLimit: 3000, rollupOptions: { input: 'smoke.html' } },
  worker: { format: 'es' }
});
