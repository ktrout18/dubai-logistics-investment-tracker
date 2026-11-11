import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'scripts/**/*.test.ts', 'pipeline/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
