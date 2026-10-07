/**
 * The pages of a docs folder, and the data a build derives from them.
 *
 * Node-side and build-time: it reads the folder, parses every page with the
 * Markdown pipeline and keeps what the site needs at run time as plain data —
 * the tree of each page, the search index and `llms.txt`. Nothing here renders;
 * a build hands the data to the components.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import type { CodeHighlighter } from '../markdown/highlight.ts';
import { parsePage } from '../markdown/parse.ts';
import type { Diagnostic, ParsedPage } from '../markdown/tree.ts';
import { renderLlmsTxt, type LlmsOptions } from './llms.ts';
import { entryFromPage, type SearchEntry } from './search.ts';
import type { SiteConfig } from './site.ts';

export interface PageFile {
  /** Relative to the docs root, with forward slashes: `guide/state/local-state.md`. */
  readonly file: string;
  /** The path the page is served at, without the base: `/guide/state/local-state`. */
  readonly route: string;
}

/** `guide/index.md` is `/guide/`, `index.md` is `/`, `guide/a.md` is `/guide/a`. */
export const routeOfFile = (file: string): string =>
  `/${file.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1')}`;

/** The Markdown file a route is written in, as a candidate: the other is `index.md`. */
export const filesOfRoute = (route: string): readonly string[] => {
  const bare = route.replace(/^\//, '');
  return bare === '' || bare.endsWith('/')
    ? [`${bare}index.md`]
    : [`${bare}.md`, `${bare}/index.md`];
};

/**
 * Folders that hold no pages: dependencies, the generated copy of the old site,
 * static assets, and the code snippets the pages import.
 */
const NOT_PAGES = new Set(['node_modules', '.vitepress', 'public', 'tests', 'dist']);

export interface DiscoverOptions {
  /** Files that are repository files, not pages: `README.md`. */
  readonly exclude?: readonly string[];
}

export const discoverPages = (
  srcRoot: string,
  options: DiscoverOptions = {},
): readonly PageFile[] => {
  const excluded = new Set(options.exclude ?? ['README.md']);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      if (NOT_PAGES.has(name)) return [];
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return walk(full);
      return name.endsWith('.md') ? [full] : [];
    });
  return walk(srcRoot)
    .map((full) => path.relative(srcRoot, full).split(path.sep).join('/'))
    .filter((file) => !excluded.has(file) && !excluded.has(path.basename(file)))
    .sort()
    .map((file) => ({ file, route: routeOfFile(file) }));
};

export interface BuiltPage {
  readonly route: string;
  readonly page: ParsedPage;
}

export interface SiteData {
  readonly pages: readonly BuiltPage[];
  readonly searchIndex: readonly SearchEntry[];
  readonly llms: string;
  readonly diagnostics: readonly (Diagnostic & { readonly route: string })[];
}

export interface BuildOptions extends DiscoverOptions {
  readonly srcRoot: string;
  readonly site: SiteConfig;
  readonly highlighter: CodeHighlighter;
  readonly llms: LlmsOptions;
}

/** Parses every page and derives the search index and `llms.txt` from them. */
export const buildSiteData = async (options: BuildOptions): Promise<SiteData> => {
  const files = discoverPages(options.srcRoot, options);
  const pages: BuiltPage[] = [];
  for (const { file, route } of files) {
    const filePath = path.join(options.srcRoot, file);
    pages.push({
      route,
      page: await parsePage(readFileSync(filePath, 'utf8'), {
        srcRoot: options.srcRoot,
        filePath,
        highlighter: options.highlighter,
      }),
    });
  }
  const searchIndex = pages.map(({ route, page }) => entryFromPage(route, page));
  return {
    pages,
    searchIndex,
    llms: renderLlmsTxt(options.site, searchIndex, options.llms),
    diagnostics: pages.flatMap(({ route, page }) =>
      page.diagnostics.map((diagnostic) => ({ ...diagnostic, route })),
    ),
  };
};
