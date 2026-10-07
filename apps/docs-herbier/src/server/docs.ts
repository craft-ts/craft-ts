import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  createCodeHighlighter,
  filesOfRoute,
  parsePage,
  type CodeHighlighter,
} from '@craft-ts/docs-ui/node';
import {
  entryFromPage,
  normalizePath,
  rebasePage,
  type ParsedPage,
  type SearchEntry,
  type SiteConfig,
} from '@craft-ts/docs-ui';
import type { PageData } from '../page-data.ts';

/** The Markdown folder. `DOCS_SRC` moves it; by default it is `apps/docs`, in place. */
export const docsSource = (): string =>
  process.env['DOCS_SRC'] ?? path.resolve(process.cwd(), 'apps/docs');

export interface LoadedPage {
  readonly data: PageData;
  /** Built from the tree before its links were rebased: what the search indexes. */
  readonly entry: SearchEntry;
}

export interface Docs {
  readonly site: SiteConfig;
  /** `undefined` when no Markdown file answers the route. */
  load(route: string): Promise<LoadedPage | undefined>;
  notFound(): PageData;
  close(): void;
}

interface Hero {
  readonly name?: string;
  readonly text?: string;
  readonly tagline?: string;
  readonly actions?: readonly { theme?: string; text?: string; link?: string }[];
}

interface Feature {
  readonly title?: string;
  readonly details?: string;
  readonly link?: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const exists = (file: string): boolean => {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
};

export const createDocs = async (options: {
  readonly srcRoot: string;
  /** The site, with its base: the navigation the pages are framed by. */
  readonly site: SiteConfig;
}): Promise<Docs> => {
  const highlighter: CodeHighlighter = await createCodeHighlighter();
  const { site } = options;
  const base = site.base;

  return {
    site,
    async load(requested) {
      const route = normalizePath(requested, base);
      const file = filesOfRoute(route).find((candidate) =>
        exists(path.join(options.srcRoot, candidate)),
      );
      if (!file) return undefined;

      const filePath = path.join(options.srcRoot, file);
      const parsed: ParsedPage = await parsePage(readFileSync(filePath, 'utf8'), {
        srcRoot: options.srcRoot,
        filePath,
        highlighter,
      });
      const entry = entryFromPage(route, parsed);
      const page = rebasePage(parsed, { route, base });
      const home = parsed.frontmatter['layout'] === 'home';
      const hero = parsed.frontmatter['hero'] as Hero | undefined;
      const features = parsed.frontmatter['features'] as readonly Feature[] | undefined;

      const data: PageData = {
        kind: home ? 'home' : 'doc',
        route,
        title: home ? text(hero?.name) || site.title : entry.title,
        blocks: page.blocks,
        outline: page.outline,
        ...(home
          ? {
              hero: {
                name: text(hero?.name),
                text: text(hero?.text),
                tagline: text(hero?.tagline),
                plateCaption: '',
                actions: (hero?.actions ?? []).map((action) => ({
                  theme: action.theme === 'brand' ? ('brand' as const) : ('alt' as const),
                  text: text(action.text),
                  link: text(action.link),
                })),
              },
              features: (features ?? []).map((feature) => ({
                title: text(feature.title),
                details: text(feature.details),
                link: text(feature.link),
              })),
            }
          : {}),
      };
      return { data, entry };
    },
    notFound: () => ({
      kind: 'notFound',
      route: '/404',
      title: 'Page not found',
      blocks: [],
      outline: [],
    }),
    close: () => highlighter.dispose(),
  };
};
