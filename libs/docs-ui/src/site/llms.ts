/**
 * `llms.txt`: the site as a list a language model can read first.
 *
 * One section per sidebar group, one line per page with its title and, when the
 * page has one, the sentence that opens it. A page no sidebar lists still
 * appears, under "Other": a model should not miss a page because the navigation
 * forgot it.
 */
import type { SearchEntry } from './search.ts';
import {
  normalizePath,
  withBase,
  type SidebarEntry,
  type SiteConfig,
} from './site.ts';

export interface LlmsOptions {
  /** The scheme and host the pages are served from: `https://craft-ts.github.io`. */
  readonly origin: string;
  /** Extra guidance for a model, written under the summary. */
  readonly details?: string;
}

const firstSentence = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end > 0 ? flat.slice(0, end + 1) : flat;
  return sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence;
};

const groupsOf = (
  entries: readonly SidebarEntry[],
  trail: readonly string[] = [],
): readonly { readonly name: string; readonly links: readonly string[] }[] => {
  const own = entries.flatMap((entry) => (entry.link ? [entry.link] : []));
  const groups: { name: string; links: readonly string[] }[] = [];
  if (own.length > 0) groups.push({ name: trail.join(' — ') || 'Overview', links: own });
  for (const entry of entries) {
    if (entry.items) {
      groups.push(...groupsOf(entry.items, [...trail, entry.text]));
    }
  }
  return groups;
};

export const renderLlmsTxt = (
  site: SiteConfig,
  pages: readonly SearchEntry[],
  options: LlmsOptions,
): string => {
  const byRoute = new Map(
    pages.map((page) => [normalizePath(page.href, site.base), page] as const),
  );
  const listed = new Set<string>();
  const line = (route: string): string | undefined => {
    const page = byRoute.get(normalizePath(route, site.base));
    if (!page) return undefined;
    listed.add(normalizePath(route, site.base));
    const url = `${options.origin}${withBase(site.base, page.href)}`;
    const summary = firstSentence(page.text.replace(page.title, '').trim());
    return `- [${page.title}](${url})${summary ? `: ${summary}` : ''}`;
  };

  const out: string[] = [`# ${site.title}`];
  if (site.description) out.push('', `> ${site.description}`);
  if (options.details) out.push('', options.details);

  const seen = new Set<string>();
  for (const sidebar of Object.values(site.sidebar)) {
    for (const group of groupsOf(sidebar)) {
      const lines = group.links
        .filter((link) => !seen.has(normalizePath(link, site.base)))
        .flatMap((link) => {
          seen.add(normalizePath(link, site.base));
          const text = line(link);
          return text ? [text] : [];
        });
      if (lines.length > 0) out.push('', `## ${group.name}`, '', ...lines);
    }
  }

  const rest = pages
    .filter((page) => !listed.has(normalizePath(page.href, site.base)))
    .map((page) => line(page.href))
    .filter((text): text is string => text !== undefined);
  if (rest.length > 0) out.push('', '## Other', '', ...rest);
  return `${out.join('\n')}\n`;
};
