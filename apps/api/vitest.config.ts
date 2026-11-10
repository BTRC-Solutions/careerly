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
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests start servers and touch the filesystem.
    testTimeout: 20_000,
  },
});
