import { content, craftComponent, div, type CraftNodeChild } from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import {
  DocHome,
  DocLayout,
  DocNotFound,
  DocPage,
  defaultLabels,
  withBase,
  type DocComponents,
  type SearchEntry,
} from '@craft-ts/docs-ui';
import type { Input } from '@craft-ts/component';
import { AgentPrompt } from './components/agent-prompt.ts';
import { AuthorNote } from './components/author-note.ts';
import { TemplateMigrator } from './components/template-migrator.ts';
import { LOCKED_DARK_PATH } from './locked.ts';
import type { DocsProps, PageData, SiteConfig } from './page-data.ts';

/** Where the search index is written, next to the pages. */
export const SEARCH_INDEX = 'search-index.json';

/**
 * The search index, fetched once the page is alive. It is the whole text of the
 * site, so it is not part of any page: a reader who never searches never pays
 * for it.
 */
export const { DocsSearchIndex, provideDocsSearchIndex } = craftService(
  { name: 'docsSearchIndex', providedIn: 'toProvide' },
  function* () {
    const entries = yield* state(
      'entries',
      [] as readonly SearchEntry[],
      ({ update }) => ({
        load: (url: string) => {
          fetch(url)
            .then((response) => response.json())
            .then((loaded: readonly SearchEntry[]) => update(() => loaded))
            .catch(() => undefined);
        },
      }),
    );
    // Only in a browser, and only after the first paint: the server has no one to search.
    if (typeof window !== 'undefined') {
      const base = document.documentElement.getAttribute('data-base') ?? '/';
      setTimeout(() => entries.load(`${base}${SEARCH_INDEX}`), 0);
    }
    yield* craftExpose('load', entries.load);
  },
);

/** The pages that name a component (`<AuthorNote />`) get the site's own. */
const components = (base: string): DocComponents => ({
  AuthorNote: () => AuthorNote({
      base: function* () {
        return base;
      },
    }),
  CraftTemplateMigrator: () => TemplateMigrator({}),
});

const FIGURE = 'Fig. 1. One state, branching into everything derived from it.';

const body = (site: SiteConfig, page: PageData): CraftNodeChild => {
  const registry = components(site.base);
  const read = (blocks: PageData['blocks']): CraftNodeChild =>
    DocPage({
      blocks: function* () {
        return blocks;
      },
      components: function* () {
        return registry;
      },
    });
  switch (page.kind) {
    case 'home':
      return div([
        DocHome({
          hero: function* () {
            return { ...(page.hero as NonNullable<PageData['hero']>), plateCaption: FIGURE };
          },
          features: function* () {
            return page.features ?? [];
          },
          base: function* () {
            return site.base;
          },
          extra: content(() => AgentPrompt({})),
        }),
        read(page.blocks),
      ]);
    case 'notFound':
      return DocNotFound({
        eyebrow: function* () {
          return '404';
        },
        heading: function* () {
          return 'Off the trail';
        },
        message: function* () {
          return 'This page is not in the herbarium. It may have moved, or never grown.';
        },
        homeLabel: function* () {
          return 'Back to the start';
        },
        homeHref: function* () {
          return site.base;
        },
      });
    default:
      return read(page.blocks);
  }
};

const lockedModeOf = (route: string): '' | 'dark' =>
  route.startsWith(LOCKED_DARK_PATH) ? 'dark' : '';

export const DocsRoot = craftComponent(
  'DocsRoot',
  { providers: [provideDocsSearchIndex()] },
  function* (input: { readonly [K in keyof DocsProps]: Input<DocsProps[K]> }) {
    const index = yield* DocsSearchIndex();
    const site = yield* input.site();
    const page = yield* input.page();
    return DocLayout({
      site: function* () {
        return site;
      },
      path: function* () {
        return withBase(site.base, page.route);
      },
      outline: function* () {
        return page.outline;
      },
      currentHeading: function* () {
        return '';
      },
      scope: function* () {
        return '';
      },
      lockedMode: function* () {
        return lockedModeOf(page.route);
      },
      searchIndex: index.entries,
      footerNote: function* () {
        return `${site.title} · MIT licensed`;
      },
      footerLinks: function* () {
        return [
          { text: 'GitHub', href: 'https://github.com/craft-ts/craft-ts' },
          { text: 'npm', href: 'https://www.npmjs.com/org/craft-ts' },
        ];
      },
      labels: function* () {
        return defaultLabels;
      },
      badge: function* () {
        return 'Beta';
      },
      body: content(() => body(site, page)),
    });
  },
);
