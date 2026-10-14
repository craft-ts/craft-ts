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
  /** The name at the top, when it is not the site's: a model reads this one first. */
  readonly title?: string;
  /** The summary under the name, when it is not the site's `description`. */
  readonly description?: string;
  /** Extra guidance for a model, written under the summary. */
  readonly details?: string;
  /**
   * Where a page is linked, under the base, when it is not the page itself: the
   * Markdown a build wrote next to it. `undefined` for a page with none.
   */
  readonly linkOf?: (page: SearchEntry) => string | undefined;
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

interface Section {
  readonly name: string;
  readonly pages: readonly SearchEntry[];
}

/**
 * The pages in the order of the sidebar, one section per group, then the ones no
 * sidebar lists under "Other". `llms.txt` and `llms-full.txt` both read in it.
 */
const sectionsOf = (site: SiteConfig, pages: readonly SearchEntry[]): readonly Section[] => {
  const byRoute = new Map(
    pages.map((page) => [normalizePath(page.href, site.base), page] as const),
  );
  const listed = new Set<string>();
  const sections: Section[] = [];
  for (const sidebar of Object.values(site.sidebar)) {
    for (const group of groupsOf(sidebar)) {
      const found: SearchEntry[] = [];
      for (const link of group.links) {
        const route = normalizePath(link, site.base);
        const page = byRoute.get(route);
        if (!page || listed.has(route)) continue;
        listed.add(route);
        found.push(page);
      }
      if (found.length > 0) sections.push({ name: group.name, pages: found });
    }
  }
  const rest = pages.filter((page) => !listed.has(normalizePath(page.href, site.base)));
  if (rest.length > 0) sections.push({ name: 'Other', pages: rest });
  return sections;
};

export const renderLlmsTxt = (
  site: SiteConfig,
  pages: readonly SearchEntry[],
  options: LlmsOptions,
): string => {
  const line = (page: SearchEntry): string => {
    const target = options.linkOf?.(page) ?? withBase(site.base, page.href);
    const summary = firstSentence(page.text.replace(page.title, '').trim());
    return `- [${page.title}](${options.origin}${target})${summary ? `: ${summary}` : ''}`;
  };

  const description = options.description ?? site.description;
  const out: string[] = [`# ${options.title ?? site.title}`];
  if (description) out.push('', `> ${description}`);
  if (options.details) out.push('', options.details);
  for (const section of sectionsOf(site, pages)) {
    out.push('', `## ${section.name}`, '', ...section.pages.map(line));
  }
  return `${out.join('\n')}\n`;
};

/**
 * `llms-full.txt`: every page's Markdown in one file, in the order of `llms.txt`,
 * for a model that would rather read once than follow forty links.
 */
export const renderLlmsFullTxt = (
  site: SiteConfig,
  pages: readonly SearchEntry[],
  markdownOf: (page: SearchEntry) => string | undefined,
): string =>
  `${sectionsOf(site, pages)
    .flatMap((section) => section.pages)
    .flatMap((page) => {
      const markdown = markdownOf(page);
      return markdown === undefined ? [] : [markdown.trimEnd()];
    })
    .join('\n\n---\n\n')}\n`;
