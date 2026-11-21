import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/contracts',
      'apps/api',
      'apps/telemetry-api',
      'apps/stats-web',
      'apps/web',
      'apps/desktop',
    ],
  },
});
