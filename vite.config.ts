import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import manifest from './manifest.config';

// CRXJS reads manifest.config.ts, bundles every entry it references
// (service worker, content scripts, side panel page) and writes a loadable
// extension to dist/. `npm run dev` keeps dist/ updated with HMR.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@profile': fileURLToPath(new URL('./profile', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    hmr: { port: 5174 },
  },
  build: { emptyOutDir: true },
});
