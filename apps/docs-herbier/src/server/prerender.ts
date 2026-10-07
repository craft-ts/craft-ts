/**
 * The build's second half: every page of the docs, written as HTML.
 *
 * Run after the browser bundle is built, because the pages link its files. It
 * parses each Markdown page once, draws it with the same root component the
 * browser hydrates, and writes the page, the 404, the search index and
 * `llms.txt` next to the bundle.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { discoverPages } from '@craft-ts/docs-ui/node';
import { renderLlmsTxt, type SearchEntry } from '@craft-ts/docs-ui';
import { SEARCH_INDEX } from '../root.ts';
import { createDocs, docsSource } from './docs.ts';
import type { Assets } from './document.ts';
import { pageDataFile } from '../page-data.ts';
import { renderPage } from './render.ts';
import { siteAt } from './site.ts';

/** `/` is `index.html`, `/guide/` is `guide/index.html`, `/guide/a` is `guide/a.html`. */
export const fileOfRoute = (route: string): string =>
  route === '/'
    ? 'index.html'
    : route.endsWith('/')
      ? `${route.slice(1)}index.html`
      : `${route.slice(1)}.html`;

interface ManifestEntry {
  readonly file: string;
  readonly css?: readonly string[];
  readonly imports?: readonly string[];
}

/** The files the browser bundle came out as, from the manifest the build wrote. */
const assetsOf = (outDir: string, base: string): Assets => {
  const manifest = JSON.parse(
    readFileSync(path.join(outDir, '.vite/manifest.json'), 'utf8'),
  ) as Record<string, ManifestEntry>;
  const entry = manifest['src/client.ts'];
  if (!entry) throw new Error('The manifest has no entry for src/client.ts.');
  const url = (file: string) => `${base}${file}`;
  // With one stylesheet for the whole bundle the build lists it under its own key,
  // not under the entry that imports it.
  const styles = entry.css ?? (manifest['style.css'] ? [manifest['style.css'].file] : []);
  return { scripts: [url(entry.file)], styles: styles.map(url) };
};

const write = (outDir: string, file: string, content: string): void => {
  const target = path.join(outDir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
};

const main = async (): Promise<void> => {
  const base = process.env['DOCS_BASE'] ?? '/craft/';
  const outDir = path.resolve(process.cwd(), process.env['DOCS_OUT'] ?? 'dist/apps/docs-herbier');
  const origin = process.env['DOCS_ORIGIN'] ?? 'https://craft-ts.github.io';
  const srcRoot = docsSource();
  const assets = assetsOf(outDir, base);
  const docs = await createDocs({ srcRoot, site: siteAt(base) });

  const entries: SearchEntry[] = [];
  const pages = discoverPages(srcRoot);
  for (const { route } of pages) {
    const loaded = await docs.load(route);
    if (!loaded) throw new Error(`No page for ${route}.`);
    entries.push(loaded.entry);
    write(outDir, fileOfRoute(route), await renderPage(docs.site, loaded.data, assets));
    // What a press on a link to this page fetches instead of the document.
    write(outDir, pageDataFile(route), JSON.stringify(loaded.data));
  }
  write(outDir, '404.html', await renderPage(docs.site, docs.notFound(), assets));
  write(outDir, SEARCH_INDEX, JSON.stringify(entries));
  write(outDir, 'llms.txt', renderLlmsTxt(docs.site, entries, { origin }));
  docs.close();
  console.log(`docs-herbier: ${pages.length} pages written to ${path.relative(process.cwd(), outDir)}`);
};

await main();
