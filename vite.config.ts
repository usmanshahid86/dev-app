import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  publicDir: false,
  resolve: {
    alias: {
      '@domain': r('./src/domain'),
      '@client': r('./src/client'),
      '@shared': r('./src/shared'),
    },
  },
  build: {
    outDir: r('./dist/client'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4100',
    },
  },
});
