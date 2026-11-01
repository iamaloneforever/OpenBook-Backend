import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/social.integration-spec.ts'],
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
