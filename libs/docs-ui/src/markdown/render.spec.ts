import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import { createCodeHighlighter } from './highlight.ts';
import { parsePage } from './parse.ts';
import { DocPage, type DocComponents } from './render.ts';

const SRC_ROOT = path.resolve(import.meta.dirname, '../../../../apps/docs');

let highlighter: Awaited<ReturnType<typeof createCodeHighlighter>>;
beforeAll(async () => {
  highlighter = await createCodeHighlighter();
});
afterAll(() => highlighter.dispose());

const renderPage = async (file: string, components: DocComponents = {}) => {
  const filePath = path.join(SRC_ROOT, file);
  const page = await parsePage(readFileSync(filePath, 'utf8'), {
    srcRoot: SRC_ROOT,
    filePath,
    highlighter,
  });
  const rendered = await renderCraftComponent(DocPage as never, {
    props: {
      blocks: function* () {
        return page.blocks;
      },
      components: function* () {
        return components;
      },
    } as never,
  });
  return { page, rendered };
};

describe('DocPage on real pages of apps/docs', () => {
  it('renders local-state.md: callouts, code, links and anchored headings', async () => {
    const { page, rendered } = await renderPage('guide/state/local-state.md');
    const root = rendered.element;

    expect(root.querySelectorAll('[role="note"]').length).toBe(
      page.blocks.filter((b) => b.t === 'callout').length +
        // callouts nested in other blocks
        0,
    );
    expect(root.querySelectorAll('pre').length).toBeGreaterThan(3);
    expect(root.querySelector('h1')?.textContent).toContain('Local state');
    expect(root.querySelector('h2[id="the-common-case"]')).not.toBeNull();
    expect(
      root.querySelector('a[href="/guide/state/server-state"]')?.textContent,
    ).toBe('query');
    expect(root.textContent).not.toContain('is not registered');
    rendered.destroy();
  });

  it('keeps the exact source of an imported snippet in the DOM', async () => {
    const { rendered } = await renderPage('guide/app/expose-api.md');
    const text = rendered.element.textContent ?? '';
    expect(text).toContain('yield*');
    expect(text).not.toContain('#region');
    expect(text).not.toContain('[!code');
    rendered.destroy();
  });

  it('puts a lesson\'s previous/next links in one row', async () => {
    const { rendered } = await renderPage('learn/01-first-state.md');
    const row = rendered.element.querySelector('[data-layout="between"]');
    expect(row?.querySelectorAll('a').length).toBe(2);
    rendered.destroy();
  });

  it('asks the app for a component the page names, and says when it is missing', async () => {
    const registered = await renderPage('index.md', {
      AuthorNote: () => 'AUTHOR NOTE',
    });
    expect(registered.rendered.element.textContent).toContain('AUTHOR NOTE');
    registered.rendered.destroy();

    const missing = await renderPage('index.md');
    expect(missing.rendered.element.textContent).toContain(
      'Component AuthorNote is not registered.',
    );
    missing.rendered.destroy();
  });

  it('renders every callout of a heavy page as a note with its tone', async () => {
    const { rendered } = await renderPage('guide/components/accessibility.md');
    for (const note of rendered.element.querySelectorAll('[role="note"]')) {
      expect(['info', 'tip', 'warning', 'danger', 'important']).toContain(
        note.getAttribute('data-tone'),
      );
    }
    rendered.destroy();
  });
});
