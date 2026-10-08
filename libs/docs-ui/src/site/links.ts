/**
 * Links and images of a parsed page, written for the place the site is served.
 *
 * A Markdown page links the way its author thinks: `/guide/state/query`,
 * `./tokens.md`, `../setup`, `/assets/logo.png`. None of these is an `href` yet.
 * `rebasePage` resolves each one against the page's own route, drops the `.md`,
 * and puts the site's base in front, so what reaches the components is what the
 * browser can follow. It is applied once, at build time, to the page tree.
 */
import type { Block, Inline, ParsedPage } from '../markdown/tree.ts';
import { withBase } from './site.ts';

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;

export interface RebaseOptions {
  /** The page's route, without the base: `/guide/state/local-state`. */
  readonly route: string;
  /** Where the site is mounted: `/craft/`. */
  readonly base: string;
}

/** One link or image address, resolved and based. External ones are left alone. */
export const rebaseHref = (href: string, options: RebaseOptions): string => {
  if (EXTERNAL.test(href) || href === '') return href;
  const directory = options.route.endsWith('/')
    ? options.route
    : options.route.slice(0, options.route.lastIndexOf('/') + 1);
  const resolved = new URL(href, `http://site${directory}`);
  const path = resolved.pathname
    .replace(/\.md$/, '')
    .replace(/(^|\/)index$/, '$1');
  return withBase(options.base, `${path}${resolved.search}${resolved.hash}`);
};

const inlines = (
  nodes: readonly Inline[],
  options: RebaseOptions,
): readonly Inline[] =>
  nodes.map((node): Inline => {
    switch (node.t) {
      case 'link':
        return {
          ...node,
          href: rebaseHref(node.href, options),
          children: inlines(node.children, options),
        };
      case 'image':
        return { ...node, src: rebaseHref(node.src, options) };
      case 'strong':
      case 'em':
      case 'del':
        return { ...node, children: inlines(node.children, options) };
      default:
        return node;
    }
  });

const blocks = (
  nodes: readonly Block[],
  options: RebaseOptions,
): readonly Block[] =>
  nodes.map((block): Block => {
    switch (block.t) {
      case 'heading':
      case 'paragraph':
        return { ...block, children: inlines(block.children, options) };
      case 'list':
        return {
          ...block,
          items: block.items.map((item) => blocks(item, options)),
        };
      case 'quote':
      case 'raw':
      case 'row':
      case 'callout':
      case 'details':
        return { ...block, children: blocks(block.children, options) };
      case 'table':
        return {
          ...block,
          head: block.head.map((cell) => inlines(cell, options)),
          rows: block.rows.map((row) => row.map((cell) => inlines(cell, options))),
        };
      case 'figure':
        return { ...block, src: rebaseHref(block.src, options) };
      default:
        return block;
    }
  });

/** The page tree with every link and image address resolved for `options.base`. */
export const rebasePage = (
  page: ParsedPage,
  options: RebaseOptions,
): ParsedPage => ({ ...page, blocks: blocks(page.blocks, options) });
