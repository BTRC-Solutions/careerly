import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

/* The server's tests run in Node; the page's opt into a DOM with `// @vitest-environment jsdom`. */
export default defineProject({
  plugins: [react()],
  test: {
    name: 'stats-web',
    environment: 'node',
    include: ['server/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
  },
});
