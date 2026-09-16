// @vitest-environment node
import { it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { compareVisualScreenshots } from './server.js';
function png(pixels: number, width = 30) {
  const image = new PNG({ width, height: 30 });
  image.data.fill(255);
  for (let i = 0; i < pixels; i++) {
    image.data[i * 4] = 0;
    image.data[i * 4 + 1] = 0;
    image.data[i * 4 + 2] = 0;
  }
  return PNG.sync.write(image);
}
it('accepts at and below the pixel budget, rejects above it and size changes', () => {
  for (const pixels of [0, 9, 10])
    expect(compareVisualScreenshots(png(pixels), png(0)).matches).toBe(true);
  expect(compareVisualScreenshots(png(11), png(0)).matches).toBe(false);
  expect(compareVisualScreenshots(png(0, 31), png(0)).sameDimensions).toBe(
    false,
  );
});
it('applies the perceptual threshold before counting pixels', () => {
  const image = PNG.sync.read(png(0));
  image.data.fill(253); // alpha remains almost opaque
  expect(compareVisualScreenshots(PNG.sync.write(image), png(0)).matches).toBe(
    true,
  );
});

it('tracks imported fixtures and page code without invalidating another page', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { defineVisualAppConfig, visualAppCaptureTargets } = await import(
    '../visual-app.js'
  );
  const { visualAppProvenance } = await import('./server.js');
  const root = await mkdtemp(join(tmpdir(), 'visual-freshness-'));
  try {
    await writeFile(
      join(root, 'page.ts'),
      "import { value } from './shared'; export const Page = value;",
    );
    await writeFile(join(root, 'shared.ts'), 'export const value = 1;');
    await writeFile(join(root, 'other.ts'), 'export const Other = 1;');
    await writeFile(join(root, 'page.mocks.ts'), 'export const fixtures = [];');
    const config = defineVisualAppConfig({
      pages: [
        {
          id: 'page',
          route: '/',
          url: '/',
          component: 'component:page.ts:Page',
          scenarios: [
            {
              id: 'base',
              category: 'happy-path',
              label: 'Base',
              mocks: { sources: ['page.mocks.ts'], endpoints: [] },
              steps: [
                {
                  action: 'capture',
                  id: 'page',
                  expect: [{ kind: 'url', url: '/' }],
                },
              ],
            },
          ],
        },
      ],
    });
    const target = visualAppCaptureTargets(config)[0]!;
    const original = await visualAppProvenance(config, target, root);
    await writeFile(join(root, 'other.ts'), 'export const Other = 2;');
    expect(await visualAppProvenance(config, target, root)).toEqual(original);
    await writeFile(join(root, 'shared.ts'), 'export const value = 2;');
    expect(await visualAppProvenance(config, target, root)).not.toEqual(
      original,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
