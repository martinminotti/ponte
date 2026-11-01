import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Test del database e della sincronizzazione su Postgres vero: `npm run test:db` (serve DATABASE_URL o il Postgres locale). */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
  },
});
