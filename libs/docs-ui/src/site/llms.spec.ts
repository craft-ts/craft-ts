import { describe, expect, it } from 'vitest';
import { renderLlmsFullTxt, renderLlmsTxt } from './llms.ts';
import type { SearchEntry } from './search.ts';
import type { SiteConfig } from './site.ts';

const site: SiteConfig = {
  title: '@craft-ts',
  description: 'The site',
  base: '/craft/',
  nav: [],
  sidebar: {
    '/guide/': [
      { text: 'Overview', link: '/guide/' },
      {
        text: 'State',
        items: [
          { text: 'Local', link: '/guide/state/local' },
          { text: 'Server', link: '/guide/state/server' },
        ],
      },
    ],
  },
};

const entry = (href: string, title: string, text: string): SearchEntry => ({
  href,
  title,
  headings: [],
  text: `${title} ${text}`,
});

const pages = [
  entry('/guide/', 'Guide', 'Everything by task.'),
  entry('/guide/state/server', 'Server', 'Loads data. And more.'),
  entry('/guide/state/local', 'Local', 'A value.'),
  entry('/orphan', 'Orphan', 'No sidebar lists me.'),
];

describe('renderLlmsTxt', () => {
  it('opens with the site, then lists a section per sidebar group and the unlisted pages last', () => {
    const text = renderLlmsTxt(site, pages, { origin: 'https://x.dev' });
    expect(text.startsWith('# @craft-ts\n\n> The site\n')).toBe(true);
    expect(text.indexOf('## Overview')).toBeLessThan(text.indexOf('## State'));
    expect(text.indexOf('## State')).toBeLessThan(text.indexOf('## Other'));
    expect(text).toContain('- [Local](https://x.dev/craft/guide/state/local): A value.');
  });

  it('speaks to an agent in its own title, summary and details, and links the Markdown it is given', () => {
    const text = renderLlmsTxt(site, pages, {
      origin: 'https://x.dev',
      title: '@craft-ts/core',
      description: 'Start here.',
      details: 'Run the MCP server.',
      linkOf: (page) => (page.href === '/orphan' ? undefined : `/craft${page.href.replace(/\/$/, '')}.md`),
    });
    expect(text.startsWith('# @craft-ts/core\n\n> Start here.\n\nRun the MCP server.\n')).toBe(true);
    expect(text).toContain('(https://x.dev/craft/guide/state/local.md)');
    expect(text).toContain('(https://x.dev/craft/guide.md)');
    // No Markdown for that page: it falls back to the page.
    expect(text).toContain('(https://x.dev/craft/orphan)');
  });
});

describe('renderLlmsFullTxt', () => {
  it('concatenates the Markdown of the pages in the order llms.txt lists them, skipping a page without one', () => {
    const text = renderLlmsFullTxt(site, pages, (page) =>
      page.href === '/orphan' ? undefined : `# ${page.title}\n`,
    );
    expect(text).toBe('# Guide\n\n---\n\n# Local\n\n---\n\n# Server\n');
  });
});
