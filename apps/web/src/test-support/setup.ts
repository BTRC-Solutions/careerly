import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// jsdom has no layout, so no `ResizeObserver` or `scrollIntoView` (cmdk's list uses both). Nothing ever resizes
// or scrolls here.
if (typeof window !== 'undefined') {
  // Typed as always there, so checked with `typeof`.
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView ??= () => {};
}

// Every screen test also checks, in the state it ends in, that axe finds nothing critical or serious (roadmap
// 8.2). Then Testing Library cleans up, which it only does by itself with global test functions, not enabled
// here.
afterEach(async (context) => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  try {
    if (context.task.result?.state !== 'fail' && document.body.childElementCount > 0) {
      const { expectAccessible } = await import('./accessibility');
      await expectAccessible();
    }
  } finally {
    cleanup();
  }
});
