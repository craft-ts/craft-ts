/**
 * The links of a docs folder, checked against the pages and headings it has.
 *
 * A link to a page that does not exist, or to a `#heading` the page does not have,
 * is a dead end the reader finds by clicking. Neither is a build error by itself:
 * an anchor is read by the browser, after the build. This reads every link of every
 * parsed page and says which ones lead nowhere, so a test can fail on them.
 *
 * Only what the pages themselves can answer is checked: a link to a file (an image, a
 * `.txt`) or to another site is left alone.
 */
import type { Block, Inline, ParsedPage } from '../markdown/tree.ts';
import { rebaseHref } from './links.ts';

export interface PageToCheck {
  /** Where the page is served, without the base: `/guide/state/local-state`. */
  readonly route: string;
  readonly page: ParsedPage;
}

export interface BrokenLink {
  /** The page the link is written in. */
  readonly route: string;
  /** As the author wrote it. */
  readonly href: string;
  readonly problem: 'no-page' | 'no-anchor';
}

/** An address that leaves the site, or is only a place in the same page. */
const LEAVES_THE_SITE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
const FILE = /\.(?!html$)[a-z0-9]+$/i;

const linksOfInlines = (nodes: readonly Inline[]): string[] =>
  nodes.flatMap((node): string[] => {
    switch (node.t) {
      case 'link':
        return [node.href, ...linksOfInlines(node.children)];
      case 'strong':
      case 'em':
      case 'del':
        return linksOfInlines(node.children);
      default:
        return [];
    }
  });

const linksOfBlocks = (blocks: readonly Block[]): string[] =>
  blocks.flatMap((block): string[] => {
    switch (block.t) {
      case 'heading':
      case 'paragraph':
        return linksOfInlines(block.children);
      case 'list':
        return block.items.flatMap(linksOfBlocks);
      case 'quote':
      case 'raw':
      case 'row':
      case 'callout':
      case 'details':
        return linksOfBlocks(block.children);
      case 'table':
        return [...block.head, ...block.rows.flat()].flatMap(linksOfInlines);
      default:
        return [];
    }
  });

const headingIdsOf = (blocks: readonly Block[]): string[] =>
  blocks.flatMap((block): string[] => {
    switch (block.t) {
      case 'heading':
        return [block.id];
      case 'list':
        return block.items.flatMap(headingIdsOf);
      case 'quote':
      case 'raw':
      case 'row':
      case 'callout':
      case 'details':
        return headingIdsOf(block.children);
      default:
        return [];
    }
  });

/** The links a home page keeps in its frontmatter: the hero's buttons and the features. */
const linksOfFrontmatter = (frontmatter: ParsedPage['frontmatter']): string[] => {
  const links: string[] = [];
  const hero = frontmatter['hero'] as { actions?: readonly { link?: unknown }[] } | undefined;
  for (const action of hero?.actions ?? []) {
    if (typeof action.link === 'string') links.push(action.link);
  }
  const features = frontmatter['features'] as readonly { link?: unknown }[] | undefined;
  for (const feature of features ?? []) {
    if (typeof feature.link === 'string' && feature.link) links.push(feature.link);
  }
  return links;
};

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const findBrokenLinks = (pages: readonly PageToCheck[]): readonly BrokenLink[] => {
  const idsByRoute = new Map(
    pages.map(({ route, page }) => [route, new Set(headingIdsOf(page.blocks))] as const),
  );
  // `/guide` and `/guide/` are one page to the host that serves them.
  const idsOf = (path: string): ReadonlySet<string> | undefined =>
    idsByRoute.get(path) ??
    idsByRoute.get(`${path}/`) ??
    (path.endsWith('/') ? idsByRoute.get(path.slice(0, -1)) : undefined);

  const broken: BrokenLink[] = [];
  for (const { route, page } of pages) {
    for (const href of [...linksOfBlocks(page.blocks), ...linksOfFrontmatter(page.frontmatter)]) {
      if (href === '' || LEAVES_THE_SITE.test(href)) continue;
      const resolved = href.startsWith('#') ? `${route}${href}` : rebaseHref(href, { route, base: '/' });
      const hash = resolved.indexOf('#');
      const path = (hash < 0 ? resolved : resolved.slice(0, hash)).split('?')[0] ?? '';
      const anchor = hash < 0 ? '' : resolved.slice(hash + 1);
      if (FILE.test(path.slice(path.lastIndexOf('/') + 1))) continue;
      const ids = idsOf(path);
      if (!ids) broken.push({ route, href, problem: 'no-page' });
      else if (anchor && !ids.has(anchor) && !ids.has(decode(anchor))) {
        broken.push({ route, href, problem: 'no-anchor' });
      }
    }
  }
  return broken;
};

/** One line per broken link, for a failing test to print. */
export const describeBrokenLinks = (broken: readonly BrokenLink[]): string[] =>
  broken.map(
    ({ route, href, problem }) =>
      `${route}: ${href} (${problem === 'no-page' ? 'no such page' : 'no such heading'})`,
  );
