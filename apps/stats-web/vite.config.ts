import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    // In development, the page asks a local stats-web server (npm start) for the aggregates.
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: { outDir: 'dist/client', emptyOutDir: true },
});
