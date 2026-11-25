import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests of the desktop app (roadmap 8.3): the built Electron app against a fake Gemini.
 * Run `npm run build` first; `npm run test:e2e` does both.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
});
