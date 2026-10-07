/**
 * Search over the pages of the site.
 *
 * An entry is built from a parsed page at build time (title, headings, body
 * text) and the index is shipped as data; the query runs in the browser, over
 * that data, with no server and no library. A match in the title outweighs one
 * in a heading, which outweighs one in the body, and every word of the query
 * must be found for a page to be returned.
 */
import type { Block, Inline, ParsedPage } from '../markdown/tree.ts';

export interface SearchEntry {
  readonly href: string;
  readonly title: string;
  readonly headings: readonly string[];
  readonly text: string;
}

export interface SearchHit {
  readonly entry: SearchEntry;
  readonly score: number;
  /** The heading the best match was in, when it was not the title. */
  readonly heading?: string;
}

const inlineText = (inlines: readonly Inline[]): string =>
  inlines
    .map((node): string => {
      switch (node.t) {
        case 'text':
        case 'code':
        case 'kbd':
          return node.text;
        case 'strong':
        case 'em':
        case 'del':
        case 'link':
          return inlineText(node.children);
        case 'image':
          return node.alt;
        case 'break':
          return ' ';
      }
    })
    .join('');

const blockText = (block: Block): string => {
  switch (block.t) {
    case 'heading':
    case 'paragraph':
      return inlineText(block.children);
    case 'list':
      return block.items.map((item) => item.map(blockText).join(' ')).join(' ');
    case 'quote':
    case 'raw':
    case 'row':
      return block.children.map(blockText).join(' ');
    case 'callout':
      return `${block.caption} ${block.children.map(blockText).join(' ')}`;
    case 'details':
      return `${block.summary} ${block.children.map(blockText).join(' ')}`;
    case 'table':
      return [...block.head, ...block.rows.flat()].map(inlineText).join(' ');
    case 'code':
      return block.lines
        .map((line) => line.tokens.map((token) => token.text).join(''))
        .join(' ');
    case 'codeGroup':
      return block.tabs.map((tab) => blockText(tab.block)).join(' ');
    case 'figure':
      return block.alt;
    case 'rule':
    case 'component':
      return '';
  }
};

/** The entry of one page: its title, its `h2`/`h3`, and the words of its body. */
export const entryFromPage = (href: string, page: ParsedPage): SearchEntry => {
  const heading = page.blocks.find(
    (block): block is Extract<Block, { t: 'heading' }> =>
      block.t === 'heading' && block.level === 1,
  );
  const title =
    (heading ? inlineText(heading.children) : '') ||
    String(page.frontmatter['title'] ?? href);
  return {
    href,
    title,
    headings: page.outline.map((item) => item.text),
    text: page.blocks
      .map(blockText)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  };
};

const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** Pages that contain every word of the query, best first. */
export const searchEntries = (
  entries: readonly SearchEntry[],
  query: string,
  limit = 8,
): readonly SearchHit[] => {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const entry of entries) {
    const title = fold(entry.title);
    const headings = entry.headings.map(fold);
    const body = fold(entry.text);
    let score = 0;
    let heading: string | undefined;
    let complete = true;
    for (const word of words) {
      const inTitle = title.includes(word);
      const headingIndex = headings.findIndex((candidate) =>
        candidate.includes(word),
      );
      const inBody = body.includes(word);
      if (!inTitle && headingIndex < 0 && !inBody) {
        complete = false;
        break;
      }
      score += inTitle ? 10 : headingIndex >= 0 ? 4 : 1;
      if (!inTitle && headingIndex >= 0 && heading === undefined) {
        heading = entry.headings[headingIndex];
      }
    }
    if (complete) {
      hits.push({ entry, score, ...(heading ? { heading } : {}) });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
};
