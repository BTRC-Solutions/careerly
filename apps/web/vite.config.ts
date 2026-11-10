import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths: the packaged app serves the build from a custom `app://` protocol.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Loaded from disk by Electron, so bundle size has no network cost.
    chunkSizeWarningLimit: 1500,
  },
});
