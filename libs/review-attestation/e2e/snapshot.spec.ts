import { expect, test, type Page } from '@playwright/test';
import {
  collectCapture,
  determinismScript,
  replayFidelity,
  snapshotPage,
  assertReplayFaithful,
} from '../src/index.ts';

/**
 * A page whose look depends on the two conditions the matrix drives.
 *
 * If the snapshot keeps the media queries verbatim, the replay re-evaluates
 * them against the window it is replayed in — and a dark, narrow scenario
 * comes back light and wide without anything saying so.
 */
const CONDITIONAL = `<!doctype html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: #fff; color: #111; }
  .card { width: 200px; padding: 8px; background: #eee; }
  .card > .title { font-weight: 600; }
  @media (min-width: 48rem) {
    .card { width: 600px; padding: 24px; }
  }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #eee; }
    .card { background: #222; }
  }
  @supports (display: grid) { .card { display: grid; gap: 4px; } }
</style>
<div class="shell">
  <div class="card" data-testid="card">
    <div class="title" data-testid="card/title">Benutzerkonto</div>
    <input data-testid="card/field">
    <label><input type="checkbox" data-testid="card/box"> keep</label>
  </div>
</div>`;

const replay = async (page: Page, html: string) => {
  await page.setContent(html);
};

test('a snapshot replays as the render that was measured', async ({
  browser,
}) => {
  const source = await browser.newPage();
  await source.addInitScript(determinismScript());
  await source.setViewportSize({ width: 375, height: 700 });
  await source.emulateMedia({ colorScheme: 'light' });
  await source.setContent(CONDITIONAL);

  const { digest } = await collectCapture(source, { root: '[data-testid=card]' });
  const snapshot = await snapshotPage(source, { root: '[data-testid=card]' });
  await source.close();

  const viewer = await browser.newPage();
  await viewer.setViewportSize({ width: 375, height: 700 });
  await viewer.emulateMedia({ colorScheme: 'light' });
  await replay(viewer, snapshot.html);
  const replayed = await collectCapture(viewer, { root: '[data-testid=card]' });

  const fidelity = replayFidelity(replayed.digest, digest);
  expect(fidelity.report).toEqual([]);
  expect(fidelity.faithful).toBe(true);
  expect(() =>
    assertReplayFaithful(replayed.digest, digest, { subject: 'card' }),
  ).not.toThrow();

  await viewer.close();
});

test('the frozen moment survives a reviewer whose machine disagrees', async ({
  browser,
}) => {
  // Captured narrow and dark; replayed wide and light. Without flattening, the
  // media queries would re-evaluate and the card would come back 600px wide on
  // a light background — a different render, judged as if it were this one.
  const source = await browser.newPage();
  await source.addInitScript(determinismScript());
  await source.setViewportSize({ width: 375, height: 700 });
  await source.emulateMedia({ colorScheme: 'dark' });
  await source.setContent(CONDITIONAL);
  const { digest } = await collectCapture(source, { root: '[data-testid=card]' });
  const snapshot = await snapshotPage(source, { root: '[data-testid=card]' });
  await source.close();

  const viewer = await browser.newPage();
  await viewer.setViewportSize({ width: 1280, height: 900 });
  await viewer.emulateMedia({ colorScheme: 'light' });
  await replay(viewer, snapshot.html);
  const replayed = await collectCapture(viewer, { root: '[data-testid=card]' });

  const card = replayed.digest.nodes.find((node) =>
    node.path.endsWith('@card'),
  );
  expect(card?.box[2]).toBe(200); // narrow, as captured — not 600
  expect(card?.styles['background-color']).toBe('rgb(34, 34, 34)'); // dark
  expect(replayFidelity(replayed.digest, digest).faithful).toBe(true);

  await viewer.close();
});

test('the snapshot carries no script and marks the attested subtree', async ({
  browser,
}) => {
  const source = await browser.newPage();
  await source.setContent(
    `${CONDITIONAL}<script>window.ran = true;</script>`,
  );
  const snapshot = await snapshotPage(source, { root: '[data-testid=card]' });
  await source.close();

  expect(snapshot.html).not.toContain('<script');
  expect(snapshot.html).toContain('data-craft-attested');

  const viewer = await browser.newPage();
  await replay(viewer, snapshot.html);
  expect(await viewer.evaluate(() => (window as { ran?: boolean }).ran)).toBeUndefined();
  await viewer.close();
});

test('form state survives, because outerHTML alone loses it', async ({
  browser,
}) => {
  const source = await browser.newPage();
  await source.setContent(CONDITIONAL);
  await source.fill('[data-testid="card/field"]', 'typed by a human');
  await source.check('[data-testid="card/box"]');
  const snapshot = await snapshotPage(source, { root: '[data-testid=card]' });
  await source.close();

  const viewer = await browser.newPage();
  await replay(viewer, snapshot.html);
  await expect(viewer.locator('[data-testid="card/field"]')).toHaveValue(
    'typed by a human',
  );
  await expect(viewer.locator('[data-testid="card/box"]')).toBeChecked();
  await viewer.close();
});

test('an unfaithful replay is reported, not passed off as the original', async ({
  browser,
}) => {
  const source = await browser.newPage();
  await source.setViewportSize({ width: 375, height: 700 });
  await source.setContent(CONDITIONAL);
  const { digest } = await collectCapture(source, { root: '[data-testid=card]' });
  const snapshot = await snapshotPage(source, { root: '[data-testid=card]' });
  await source.close();

  // A stylesheet that went missing between capture and replay — the shape of
  // every fidelity failure: it still looks like a page.
  const broken = snapshot.html.replace('width: 200px', 'width: 320px');

  const viewer = await browser.newPage();
  await viewer.setViewportSize({ width: 375, height: 700 });
  await replay(viewer, broken);
  const replayed = await collectCapture(viewer, { root: '[data-testid=card]' });

  const fidelity = replayFidelity(replayed.digest, digest);
  expect(fidelity.faithful).toBe(false);
  expect(fidelity.moved.length).toBeGreaterThan(0);
  // One sentence a reviewer can act on, then the addresses behind it — not a
  // wall of paths they have to interpret.
  expect(fidelity.summary).toContain('measure differently');
  expect(fidelity.report.join('\n')).toContain('@card width 200→320');
  expect(() => assertReplayFaithful(replayed.digest, digest)).toThrow(
    /nobody attested/,
  );

  await viewer.close();
});
