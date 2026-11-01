import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/read-list.integration-spec.ts'],
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
