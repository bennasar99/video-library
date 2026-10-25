import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next.js keeps JSX transform as "preserve" in tsconfig; tests need the
  // automatic runtime so components/tests don't require a React import.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
