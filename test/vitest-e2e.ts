import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: 'node',
    env: {
      JWT_ACCESS_SECRET: 'e2e-access-secret',
      JWT_REFRESH_SECRET: 'e2e-refresh-secret',
    },
    include: ['test/**/*.e2e-spec.ts'],
    coverage: {
      provider: 'v8',
    },
  },
});
