import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Testing Library only cleans up by itself with global test functions, which this repo does not enable.
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
