import axe from 'axe-core';

/*
 * Accessibility check of the rendered screen with axe-core (roadmap 8.2, RNF-11). Fails on `critical` and
 * `serious` violations. jsdom does not lay out or paint, so rules that need it (color contrast) are off here:
 * contrast is checked by hand in Chromium (and in the end-to-end flow of roadmap 8.3).
 */

const FAILING_IMPACTS: ReadonlySet<string> = new Set(['critical', 'serious']);

/** Throws with every critical or serious violation in the document, or in `root`. */
export async function expectAccessible(root: Element = document.body): Promise<void> {
  const results = await axe.run(root, {
    resultTypes: ['violations'],
    // Frames only hold the PDF previews, which are not the app's UI (and jsdom cannot message into them).
    iframes: false,
    rules: { 'color-contrast': { enabled: false } },
  });
  const failing = results.violations.filter((violation) =>
    FAILING_IMPACTS.has(violation.impact ?? ''),
  );
  if (failing.length === 0) return;
  const report = failing
    .map(
      (violation) =>
        `- [${violation.impact}] ${violation.id}: ${violation.help}\n` +
        violation.nodes.map((node) => `    ${node.html}`).join('\n'),
    )
    .join('\n');
  throw new Error(`Accessibility violations (axe):\n${report}`);
}
