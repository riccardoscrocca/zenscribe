import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: [], // Remove lucide-react from exclusions since it's not needed
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
    outDir: 'dist',
    // Assicurati che _redirects venga copiato nella build
    copyPublicDir: true,
  },
  // Solo per essere sicuri che le variabili d'ambiente vengano correttamente sostituite
  envPrefix: 'VITE_',
});