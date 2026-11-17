import { defineConfig } from 'vite';

// base './' so the app works from the Android WebView; assetsInlineLimit 0 keeps data: URIs
// out of CSS/JS so the strict Content-Security-Policy in index.html can stay strict.
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0, sourcemap: false, chunkSizeWarningLimit: 3000 },
  worker: { format: 'es' }
});
