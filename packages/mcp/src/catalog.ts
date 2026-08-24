export const DOCS_ORIGIN = 'https://craft-ts.github.io/craft';

export type DocPage = {
  path: string;
  title: string;
  description?: string;
  body: string;
};

export type SkillRecord = {
  name: string;
  description: string;
  markdown: string;
  references: Record<string, string>;
};

export type SearchHit = {
  path: string;
  title: string;
  description?: string;
  url: string;
  score: number;
  snippet: string;
};

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_+*/-]+/)
    .filter((token) => token.length > 1);
}

function countHits(haystack: string, terms: string[]): number {
  return terms.reduce(
    (score, term) => score + (haystack.split(term).length - 1),
    0,
  );
}

function snippetAround(body: string, terms: string[]): string {
  const lower = body.toLowerCase();
  const index = terms
    .map((term) => lower.indexOf(term))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0];
  if (index === undefined) {
    return body.slice(0, 280).trim();
  }
  const start = Math.max(0, index - 80);
  const excerpt = body.slice(start, start + 280).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${excerpt}${start + 280 < body.length ? '…' : ''}`;
}

export function pageUrl(path: string): string {
  return `${DOCS_ORIGIN}${path === '/' ? '/' : path}`;
}

export function searchPages(
  pages: readonly DocPage[],
  query: string,
  options: { limit?: number; section?: string } = {},
): SearchHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const section = options.section?.replace(/^\//, '');
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);

  return pages
    .filter((page) => {
      if (!section) return true;
      if (section === 'examples') {
        return (
          page.path.startsWith('/learn/') ||
          page.path.startsWith('/resources/examples')
        );
      }
      return page.path === `/${section}` || page.path.startsWith(`/${section}/`);
    })
    .map((page) => {
      const titleHits = countHits(page.title.toLowerCase(), terms);
      const pathHits = countHits(page.path.toLowerCase(), terms);
      const descriptionHits = countHits(
        (page.description ?? '').toLowerCase(),
        terms,
      );
      const bodyHits = countHits(page.body.toLowerCase(), terms);
      const score =
        titleHits * 12 + pathHits * 8 + descriptionHits * 6 + bodyHits;
      return {
        path: page.path,
        title: page.title,
        description: page.description,
        url: pageUrl(page.path),
        score,
        snippet: snippetAround(page.body, terms),
      };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

export function findPage(
  pages: readonly DocPage[],
  path: string,
): DocPage | undefined {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return pages.find(
    (page) =>
      page.path === normalised ||
      page.path === `${normalised.replace(/\/$/, '')}`,
  );
}
