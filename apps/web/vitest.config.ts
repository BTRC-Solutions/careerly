import { defineProject } from 'vitest/config';

/*
 * Logic tests run in Node. Component tests opt into a DOM with a `// @vitest-environment jsdom` comment at the
 * top of the file and use the helpers in `src/test-support/` (Testing Library + MSW for the API).
 */
export default defineProject({
  test: {
    name: 'web',
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-support/setup.ts'],
  },
});
