import type { Outline, SiteConfig, Block } from '@craft-ts/docs-ui';
import type { HomeFeature, HomeHero } from '@craft-ts/docs-ui';

/**
 * What one page needs to be drawn: the same value is read on the server, to
 * write the HTML, and in the browser, to hydrate it. It is plain data.
 */
export interface PageData {
  /** `doc` is a Markdown page, `home` is a page with `layout: home`, `notFound` is the 404. */
  readonly kind: 'doc' | 'home' | 'notFound';
  /** Where the page is served, without the base: `/guide/state/local-state`. */
  readonly route: string;
  readonly title: string;
  /** What the page says about itself, from its frontmatter: the site's own when it has none. */
  readonly description?: string;
  readonly blocks: readonly Block[];
  readonly outline: readonly Outline[];
  readonly hero?: HomeHero;
  readonly features?: readonly HomeFeature[];
}

export interface DocsProps {
  readonly site: SiteConfig;
  readonly page: PageData;
}

export type { SiteConfig };

/**
 * A component input is a reader, not a value: `yield* input.site()`. The page
 * arrives as plain data, so this is where it becomes the inputs of the root, the
 * same way on the server and in the browser.
 */
export const asInputs = (props: DocsProps) => ({
  site: function* () {
    return props.site;
  },
  page: function* () {
    return props.page;
  },
});

/** Where the data of one page is written, under the base: `page-data/guide/a.json`. */
export const pageDataFile = (route: string): string =>
  `page-data${route.endsWith('/') ? `${route}index` : route}.json`;

/**
 * The route a URL path stands for, without the base and without the `.html` a static host
 * adds: `/craft/guide/a.html` → `/guide/a`, `/craft/guide/index.html` → `/guide/`.
 * `undefined` for a path outside the base.
 */
export const routeOfPath = (pathname: string, base: string): string | undefined => {
  if (!pathname.startsWith(base)) return undefined;
  const route = `/${pathname.slice(base.length)}`
    .replace(/\.html$/, '')
    .replace(/\/index$/, '/');
  return route;
};

/**
 * The `<title>` of a page: the site's own on the home page, `404 | site` on the
 * not-found page, and the site's alone when a page has no title of its own.
 */
export const documentTitle = (siteTitle: string, page: PageData): string => {
  if (page.route === '/') return siteTitle;
  const title = page.kind === 'notFound' ? '404' : page.title;
  return title ? `${title} | ${siteTitle}` : siteTitle;
};

/** The `<meta name="description">` of a page: its own, else the site's. */
export const documentDescription = (
  site: { readonly description?: string },
  page: PageData,
): string =>
  page.kind === 'notFound' ? 'Not Found' : (page.description ?? site.description ?? '');

/**
 * Where the Markdown of a page is written, under the base: `/guide/a` is `guide/a.md`
 * and `/guide/` is `guide.md`, as the old site served them. The home page has none.
 */
export const markdownFileOfRoute = (route: string): string | undefined => {
  const bare = route.replace(/^\//, '').replace(/\/$/, '');
  return bare === '' ? undefined : `${bare}.md`;
};
