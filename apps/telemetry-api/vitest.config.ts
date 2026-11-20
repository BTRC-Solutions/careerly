import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

export default defineProject({
  // Vitest's default transformer (esbuild/oxc) does not emit decorator metadata, which Nest DI needs.
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    name: 'telemetry-api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // PGlite starts a whole Postgres in WASM: slower on busy Windows runners.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
