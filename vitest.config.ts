import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': r('./src/domain'),
      '@providers': r('./src/providers'),
      '@db': r('./src/db'),
      '@workflows': r('./src/workflows'),
      '@server': r('./src/server'),
      '@client': r('./src/client'),
      '@shared': r('./src/shared'),
      '@telemetry': r('./src/telemetry'),
      '@export': r('./src/export'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
  },
});
