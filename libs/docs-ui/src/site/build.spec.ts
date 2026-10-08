// @vitest-environment node
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import config from '../../../../apps/docs/.vitepress/config.mts';
import { createCodeHighlighter } from '../markdown/highlight.ts';
import { buildSiteData, discoverPages, filesOfRoute, routeOfFile, type SiteData } from './pages.ts';
import { searchEntries } from './search.ts';
import { isCurrent, normalizePath, pagerFor, sidebarFor, sidebarPages, trailFor } from './site.ts';
import { siteFromVitepress } from './vitepress.ts';

/**
 * The real docs and the real VitePress configuration, run through the site
 * model. Where `corpus.spec.ts` says the *pages* survive the move, this says the
 * *navigation* does: every link of every sidebar leads to a page, every page is
 * reachable, and a search finds what a reader would look for.
 */
const SRC_ROOT = path.resolve(import.meta.dirname, '../../../../apps/docs');
const site = siteFromVitepress(config as never);

describe('siteFromVitepress, on the configuration of apps/docs', () => {
  it('keeps the title, the base and the sections of the top bar', () => {
    expect(site.title).toBe('@craft-ts');
    expect(site.base).toBe('/craft/');
    expect(site.nav.map((entry) => entry.text)).toEqual([
      'Learn',
      'Learn with Effect',
      'AI agents',
      'Guide',
      'Reference',
      'Packages',
      'Resources',
    ]);
    expect(Object.keys(site.sidebar).sort()).toEqual(
      ['/guide/', '/guide/ai/', '/learn-effect/', '/learn/', '/reference/', '/resources/'].sort(),
    );
  });

  it('turns a link with a directory into its index page, and every link into a file that exists', () => {
    const dangling: string[] = [];
    for (const entries of Object.values(site.sidebar)) {
      for (const page of sidebarPages(entries)) {
        const exists = filesOfRoute(page.link).some((file) => existsSync(path.join(SRC_ROOT, file)));
        if (!exists) dangling.push(page.link);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('routes a file to the path it is served at, and back', () => {
    expect(routeOfFile('index.md')).toBe('/');
    expect(routeOfFile('guide/index.md')).toBe('/guide/');
    expect(routeOfFile('guide/state/local-state.md')).toBe('/guide/state/local-state');
    expect(filesOfRoute('/guide/')).toEqual(['guide/index.md']);
    expect(filesOfRoute('/guide/state/local-state')).toEqual([
      'guide/state/local-state.md',
      'guide/state/local-state/index.md',
    ]);
  });
});

describe('the pages of apps/docs, as the site model sees them', () => {
  const pages = discoverPages(SRC_ROOT);

  it('finds the pages and leaves the repository files out', () => {
    expect(pages.length).toBeGreaterThan(100);
    expect(pages.map((page) => page.file)).not.toContain('README.md');
    expect(pages.map((page) => page.route)).toContain('/');
  });

  // Pages that exist, are linked from other pages, and are in no sidebar: a reader
  // who lands on one has no sidebar entry highlighted and no previous/next. VitePress
  // has the same gap today. The list is fixed so a new orphan fails this test; the
  // way to shrink it is to add the page to `apps/docs/.vitepress/config.mts`.
  const KNOWN_ORPHANS = [
    '/guide/migration/wave-1-tag-and-provided-in',
    '/guide/routing/hash-location',
    '/guide/testing/architecture/primitive-method-usage',
    '/guide/testing/architecture/resource-params-query-state',
    '/guide/testing/architecture/unused-primitive-method',
    '/guide/testing/folder-layout',
  ];

  it('puts every page in the sidebar of its section, bar the six that no sidebar lists yet', () => {
    const orphans = pages
      .filter((page) => page.route !== '/')
      .filter((page) => {
        const sidebar = sidebarFor(site, page.route);
        return !sidebarPages(sidebar).some((entry) => isCurrent(entry.link, page.route));
      })
      .map((page) => page.route);
    expect(orphans).toEqual(KNOWN_ORPHANS);
  });

  it('gives every page of a sidebar a trail and a pager that agree with it', () => {
    for (const entries of Object.values(site.sidebar)) {
      const list = sidebarPages(entries);
      list.forEach((page, index) => {
        // A page listed under another section's prefix (`/resources/ai-agents` in
        // the AI sidebar) is read inside the sidebar of its own prefix.
        if (sidebarFor(site, page.link) !== entries) return;
        const pager = pagerFor(site, page.link);
        expect(pager.next?.link, `after ${page.link}`).toBe(list[index + 1]?.link);
        expect(pager.previous?.link, `before ${page.link}`).toBe(list[index - 1]?.link);
        expect(trailFor(site, page.link).at(-1)?.label, `trail of ${page.link}`).toBe(page.text);
      });
    }
  });

  it('lights exactly one section of the bar for a page of the guide', () => {
    expect(normalizePath('/craft/guide/state/local-state.html', site.base)).toBe(
      '/guide/state/local-state',
    );
  });
});

describe('the data a build derives from the pages', () => {
  let highlighter: Awaited<ReturnType<typeof createCodeHighlighter>>;
  let data: SiteData;
  beforeAll(async () => {
    highlighter = await createCodeHighlighter();
    data = await buildSiteData({
      srcRoot: SRC_ROOT,
      site,
      highlighter,
      llms: { origin: 'https://craft-ts.github.io' },
    });
  }, 120_000);
  afterAll(() => highlighter.dispose());

  it('parses every page with no unresolved import and no HTML left over', () => {
    const kinds = data.diagnostics.map((diagnostic) => diagnostic.kind);
    expect(kinds.filter((kind) => kind === 'snippet-missing')).toEqual([]);
    expect(kinds.filter((kind) => kind === 'snippet-region-missing')).toEqual([]);
    expect(kinds.filter((kind) => kind === 'html-block')).toEqual([]);
  });

  it('indexes every page, and finds a page by what a reader would type', () => {
    expect(data.searchIndex.length).toBe(data.pages.length);
    const hits = searchEntries(data.searchIndex, 'insertions');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.entry.href).toMatch(/insertion/);
  });

  it('writes an llms.txt with one section per group of the sidebars and a link per page', () => {
    expect(data.llms.startsWith('# @craft-ts\n')).toBe(true);
    expect(data.llms).toContain('## Core concepts');
    expect(data.llms).toContain('(https://craft-ts.github.io/craft/guide/state/local-state)');
    // Each page is listed once.
    const links = data.llms.match(/\]\(https:\/\/craft-ts\.github\.io[^)]*\)/g) ?? [];
    expect(new Set(links).size).toBe(links.length);
    expect(links.length).toBe(data.pages.length);
  });
});
