/**
 * The shape of the site: its top navigation, its sidebars, and what can be
 * derived from them for one page — which sidebar applies, which row is current,
 * where the page sits in the trail, what comes before and after it.
 *
 * Plain data and pure functions, no component and no colour: the part of a docs
 * theme that decides *what* to show, kept apart from *how* it looks so a test
 * can pin it without rendering anything. The data has the shape of VitePress's
 * `themeConfig.nav` and `themeConfig.sidebar`, so an existing configuration
 * moves over as it is.
 */

export interface SidebarEntry {
  readonly text: string;
  /** A page. A group has `items` instead (or as well: a group may be a page). */
  readonly link?: string;
  readonly items?: readonly SidebarEntry[];
  /** A group that starts closed, unless the page being read is inside it. */
  readonly collapsed?: boolean;
}

export interface NavLinkEntry {
  readonly text: string;
  readonly link: string;
  /** A regular expression, tested against the path: which pages light this up. */
  readonly activeMatch?: string;
}

export interface NavMenuEntry {
  readonly text: string;
  readonly items: readonly { readonly text: string; readonly link: string }[];
  readonly activeMatch?: string;
}

export type NavEntry = NavLinkEntry | NavMenuEntry;

export interface SiteConfig {
  readonly title: string;
  readonly description?: string;
  /** Where the site is mounted: `/craft/` on GitHub Pages. Always slash-bounded. */
  readonly base: string;
  readonly nav: readonly NavEntry[];
  /** Sidebars by path prefix: `/guide/` applies to every page under it. */
  readonly sidebar: Readonly<Record<string, readonly SidebarEntry[]>>;
}

export const isMenu = (entry: NavEntry): entry is NavMenuEntry =>
  'items' in entry;

/**
 * A path as the site writes it: no base, no query, no hash, no `.html`, and a
 * directory ends with a slash. `/craft/guide/state/local-state.html#x` and
 * `/guide/state/local-state` are the same page.
 */
export const normalizePath = (path: string, base = '/'): string => {
  let result = path.split('#')[0]?.split('?')[0] ?? '';
  if (base !== '/' && result.startsWith(base)) {
    result = `/${result.slice(base.length)}`;
  }
  result = result.replace(/\.html$/, '').replace(/\/index$/, '/');
  if (!result.startsWith('/')) result = `/${result}`;
  return result;
};

/** The sidebar for a page: the one under the longest prefix that matches. */
export const sidebarFor = (
  config: SiteConfig,
  path: string,
): readonly SidebarEntry[] => {
  const target = normalizePath(path, config.base);
  const prefix = Object.keys(config.sidebar)
    .sort((a, b) => b.length - a.length)
    .find((key) => target.startsWith(key));
  return prefix ? (config.sidebar[prefix] ?? []) : [];
};

/** Is this link the page being read? A directory and its index are the same. */
export const isCurrent = (link: string, path: string, base = '/'): boolean =>
  normalizePath(link, base) === normalizePath(path, base);

/** Does the top-navigation entry cover this page? */
export const isActiveNav = (
  entry: NavEntry,
  path: string,
  base = '/',
): boolean => {
  const target = normalizePath(path, base);
  if (entry.activeMatch) return new RegExp(entry.activeMatch).test(target);
  if (isMenu(entry)) {
    return entry.items.some((item) => isCurrent(item.link, target));
  }
  return isCurrent(entry.link, target);
};

/**
 * The one top-navigation entry that stands for this page: the first, in the order of
 * the bar, that covers it. Two entries can cover a page — `/guide/ai/` is under
 * `Guide` as well as under `AI agents` — and the bar names a single section. Authors
 * put the narrower entry first, as the VitePress configuration already does.
 */
export const activeNavIndex = (
  entries: readonly NavEntry[],
  path: string,
  base = '/',
): number => entries.findIndex((entry) => isActiveNav(entry, path, base));

const pagesOf = (
  entries: readonly SidebarEntry[],
): readonly { readonly text: string; readonly link: string }[] =>
  entries.flatMap((entry) => [
    ...(entry.link ? [{ text: entry.text, link: entry.link }] : []),
    ...(entry.items ? pagesOf(entry.items) : []),
  ]);

/** The pages of a sidebar, in reading order. */
export const sidebarPages = pagesOf;

export interface PagerPair {
  readonly previous: { readonly text: string; readonly link: string } | null;
  readonly next: { readonly text: string; readonly link: string } | null;
}

/** The page before and the page after, within the sidebar the page belongs to. */
export const pagerFor = (config: SiteConfig, path: string): PagerPair => {
  const pages = pagesOf(sidebarFor(config, path));
  const index = pages.findIndex((page) =>
    isCurrent(page.link, path, config.base),
  );
  if (index < 0) return { previous: null, next: null };
  return {
    previous: pages[index - 1] ?? null,
    next: pages[index + 1] ?? null,
  };
};

export interface Crumb {
  readonly label: string;
  readonly href: string;
}

const findTrail = (
  entries: readonly SidebarEntry[],
  path: string,
  base: string,
): readonly SidebarEntry[] | undefined => {
  for (const entry of entries) {
    if (entry.link && isCurrent(entry.link, path, base)) return [entry];
    const inner = entry.items ? findTrail(entry.items, path, base) : undefined;
    if (inner) return [entry, ...inner];
  }
  return undefined;
};

/**
 * Where a page sits: the site, then each group above it, then the page. A group
 * that is not itself a page has no link of its own, so it points at the first
 * page it holds.
 */
export const trailFor = (config: SiteConfig, path: string): readonly Crumb[] => {
  const trail = findTrail(sidebarFor(config, path), path, config.base);
  if (!trail) return [];
  return trail.map((entry) => ({
    label: entry.text,
    href: entry.link ?? pagesOf(entry.items ?? [])[0]?.link ?? '#',
  }));
};

/** Does the entry, or anything under it, hold the page being read? */
export const holds = (
  entry: SidebarEntry,
  path: string,
  base = '/',
): boolean =>
  (entry.link ? isCurrent(entry.link, path, base) : false) ||
  (entry.items?.some((item) => holds(item, path, base)) ?? false);

/** `1` → `i.`, `4` → `iv.`: the numerals that count the groups of a sidebar. */
export const roman = (value: number): string => {
  const table: readonly (readonly [number, string])[] = [
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let rest = value;
  let out = '';
  for (const [amount, glyph] of table) {
    while (rest >= amount) {
      out += glyph;
      rest -= amount;
    }
  }
  return `${out}.`;
};

const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** A link as it goes in an `href`: the site's base in front, unless it leaves the site. */
export const withBase = (base: string, link: string): string =>
  ABSOLUTE.test(link) || base === '/'
    ? link
    : `${base}${link.replace(/^\//, '')}`;
