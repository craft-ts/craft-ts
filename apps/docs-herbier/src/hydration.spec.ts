import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hydrateCraft, renderCraft } from '@craft-ts/component';
import { appConfig } from './app.config.ts';
import { asInputs } from './page-data.ts';
import type { SiteConfig } from '@craft-ts/docs-ui';
import { createDocs, type Docs } from './server/docs.ts';

const SRC_ROOT = path.resolve(import.meta.dirname, '../../docs');

/** Enough navigation to frame the pages under test; the real one is `siteAt`. */
const site: SiteConfig = {
  title: '@craft-ts',
  base: '/craft/',
  nav: [
    { text: 'Learn', link: '/learn/', activeMatch: '^/learn/' },
    { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
  ],
  sidebar: {
    '/learn/': [{ text: 'Learn', items: [{ text: 'Overview', link: '/learn/' }] }],
    '/guide/': [
      {
        text: 'Managing state',
        items: [{ text: 'Local state', link: '/guide/state/local-state' }],
      },
    ],
  },
};

const MODE = process.env['HYDRATION_MODE'] === 'development' ? 'development' : 'production';

let docs: Docs;
beforeAll(async () => {
  docs = await createDocs({ srcRoot: SRC_ROOT, site });
});
afterAll(() => docs.close());

/**
 * What the build does and the browser then undoes: draw a real page on the server,
 * hydrate it with the same data, and ask that nothing was thrown away.
 */
const roundTrip = async (route: string) => {
  const loaded = await docs.load(route);
  if (!loaded) throw new Error(`No page for ${route}`);
  const props = asInputs({ site: docs.site, page: loaded.data });
  const rendered = await renderCraft({
    config: appConfig,
    props,
    url: `/craft${route}`,
    includeStyles: false,
    mode: MODE,
  });
  document.body.innerHTML = rendered.html;
  const host = document.querySelector('craft-root') as HTMLElement;
  const drawn = host.querySelector('main')?.textContent ?? '';
  const hydrated = hydrateCraft({ config: appConfig, host, props, mode: MODE });
  return { host, drawn, hydrated };
};

describe('a real page of apps/docs, drawn on the server and hydrated', () => {
  it.each(['/learn/', '/guide/state/local-state'])(
    'keeps %s whole: no mismatch, and the text is still there',
    async (route) => {
      const { host, drawn, hydrated } = await roundTrip(route);
      expect(drawn.length).toBeGreaterThan(500);
      expect(hydrated.mismatches.map((error) => error.message)).toEqual([]);
      expect(host.querySelector('main')?.textContent).toBe(drawn);
      hydrated.destroy();
    },
  );

  it('keeps the page when the search index arrives after hydration', async () => {
    const entries = [{ href: '/learn/', title: 'Learn', headings: [], text: 'Learn' }];
    vi.stubGlobal('fetch', () => Promise.resolve({ json: () => Promise.resolve(entries) }));
    try {
      const { host, drawn, hydrated } = await roundTrip('/learn/');
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(host.querySelector('main')?.textContent).toBe(drawn);
      hydrated.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
