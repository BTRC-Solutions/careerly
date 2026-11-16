import { defineProject } from 'vitest/config';

// Only modules that do not import `electron` are unit-tested here (e.g. the API key store).
export default defineProject({
  test: { name: 'desktop', environment: 'node', include: ['src/**/*.test.ts'] },
});
