import { expect, test } from '@playwright/test';
import {
  clipOf,
  collectCapture,
  determinismScript,
  visibleBandOf,
} from '../src/index.ts';

/**
 * A component taller than the viewport, inside a padded shell, with a fixed
 * button parked over its bottom-right corner.
 *
 * The shape of the demo's own design-system route, reduced to the three facts
 * that make "attested" and "looked at" different sets.
 */
const SHELL = `<!doctype html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: #fff; }
  .shell { padding: 32px; margin: 24px; background: #fff; }
  .host { display: grid; gap: 8px; }
  .row { height: 120px; background: #eee; }
  .pinned {
    position: fixed; bottom: 16px; right: 16px;
    width: 140px; height: 48px; background: #374151; color: #fff;
  }
</style>
<div class="shell">
  <div class="host" data-testid="host">
    ${Array.from({ length: 12 }, (_, index) => `<div class="row" data-testid="row-${index}">row ${index}</div>`).join('')}
  </div>
</div>
<button class="pinned" data-testid="pinned">Clear cache</button>`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(determinismScript());
  await page.setViewportSize({ width: 375, height: 600 });
  await page.setContent(SHELL);
});

test('separates what is attested from what could be looked at', async ({
  page,
}) => {
  const { digest, scope } = await collectCapture(page, {
    root: '[data-testid=host]',
  });

  expect(scope.attested).toEqual(digest.nodes.map((node) => node.path).sort());
  expect(scope.attested.length).toBe(13); // the host and its twelve rows

  // Taller than the viewport, so most of what is attested was never on screen.
  expect(scope.root.height).toBeGreaterThan(scope.viewport.height);
  expect(scope.offScreen.length).toBeGreaterThan(0);
  expect(scope.attested.length).toBeGreaterThan(scope.offScreen.length);

  // Covered by chrome that is not part of the subject at all.
  expect(scope.occluded.map((entry) => entry.by)).toContain('button.pinned');
  const covered = scope.occluded[0]?.path;
  expect(scope.attested).toContain(covered);
});

test('the capture region holds both the shell around it and the overflow below', async ({
  page,
}) => {
  const { scope } = await collectCapture(page, { root: '[data-testid=host]' });

  // The root alone starts inside the shell's padding — that is the framing bug
  // this region exists to remove.
  expect(scope.root.x).toBeGreaterThan(0);
  expect(scope.region.x).toBeLessThanOrEqual(0);
  expect(scope.region.width).toBeGreaterThanOrEqual(scope.viewport.width);
  expect(scope.region.height).toBeGreaterThanOrEqual(scope.root.height);
});

test('the visible band lands where the viewport was, in the image own coordinates', async ({
  page,
}) => {
  const { scope } = await collectCapture(page, { root: '[data-testid=host]' });
  const band = visibleBandOf(scope);

  expect(band.width).toBe(scope.viewport.width);
  expect(band.height).toBe(scope.viewport.height);
  // The page is not scrolled, so the band starts at the image's top-left.
  expect(band.x).toBe(0);
  expect(band.y).toBe(0);
  expect(band.height).toBeLessThan(scope.region.height);
});

test('the region is a usable screenshot clip', async ({ page }) => {
  const { scope } = await collectCapture(page, { root: '[data-testid=host]' });
  const clip = clipOf(scope.region);

  const image = await page.screenshot({ clip, fullPage: true });
  expect(image.byteLength).toBeGreaterThan(0);

  // The captured picture is exactly the region the scope described, which is
  // what lets the review draw the visible band onto it without any arithmetic.
  const { width, height } = await page.evaluate(
    async (bytes: number[]) =>
      await new Promise<{ width: number; height: number }>((resolve) => {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const probe = new Image();
        probe.onload = () =>
          resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
        probe.src = url;
      }),
    [...image],
  );
  expect(width).toBe(clip.width);
  expect(height).toBe(clip.height);
});
