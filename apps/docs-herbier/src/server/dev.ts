import { discoverPages } from '@craft-ts/docs-ui/node';
import { createDocs, docsSource, type Docs } from './docs.ts';
import type { Assets } from './document.ts';
import { renderPage } from './render.ts';
import { siteAt } from './site.ts';

export interface DevResult {
  readonly status: number;
  readonly html: string;
}

let docs: Promise<Docs> | undefined;

/** One page for the dev server: parsed when it is asked for, never ahead of time. */
export const renderDevPage = async (
  pathname: string,
  assets: Assets,
  base: string,
): Promise<DevResult> => {
  docs ??= createDocs({ srcRoot: docsSource(), site: siteAt(base) });
  const loaded = await docs;
  const found = await loaded.load(pathname.replace(/\.html$/, ''));
  return {
    status: found ? 200 : 404,
    html: await renderPage(loaded.site, found?.data ?? loaded.notFound(), assets),
  };
};

let index: Promise<readonly unknown[]> | undefined;

/** The search index of the whole site, built the first time it is asked for. */
export const devSearchIndex = (base = '/'): Promise<readonly unknown[]> => {
  index ??= (async () => {
    const loaded = await (docs ??= createDocs({ srcRoot: docsSource(), site: siteAt(base) }));
    const entries: unknown[] = [];
    for (const { route } of discoverPages(docsSource())) {
      const page = await loaded.load(route);
      if (page) entries.push(page.entry);
    }
    return entries;
  })();
  return index;
};
