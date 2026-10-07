// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCodeHighlighter } from './highlight.ts';
import { parsePage } from './parse.ts';
import type { Block, Diagnostic } from './tree.ts';

/**
 * The real corpus: every Markdown page of `apps/docs`. This is the test that
 * says whether the pipeline can replace VitePress for *these* docs, as opposed
 * to the constructs the unit tests happen to think of.
 */
const SRC_ROOT = path.resolve(import.meta.dirname, '../../../../apps/docs');
const SKIP = new Set(['node_modules', '.vitepress', 'public', 'tests', 'dist']);

const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (SKIP.has(name)) return [];
    if (statSync(full).isDirectory()) return pages(full);
    return name.endsWith('.md') && name !== 'README.md' ? [full] : [];
  });

const walk = (blocks: readonly Block[], visit: (block: Block) => void): void => {
  for (const block of blocks) {
    visit(block);
    if (
      block.t === 'callout' ||
      block.t === 'details' ||
      block.t === 'raw' ||
      block.t === 'quote'
    ) {
      walk(block.children, visit);
    } else if (block.t === 'list') {
      for (const item of block.items) walk(item, visit);
    }
  }
};

let highlighter: Awaited<ReturnType<typeof createCodeHighlighter>>;
beforeAll(async () => {
  highlighter = await createCodeHighlighter();
});
afterAll(() => highlighter.dispose());

describe('apps/docs corpus', () => {
  it('parses every page, and every `:::` and `<<<` of the docs lands on a component', async () => {
    const files = pages(SRC_ROOT);
    const counts = { callout: new Map<string, number>(), details: 0, code: 0, table: 0, heading: 0 };
    const diagnostics: (Diagnostic & { file: string })[] = [];

    for (const file of files) {
      const page = await parsePage(readFileSync(file, 'utf8'), {
        srcRoot: SRC_ROOT,
        filePath: file,
        highlighter,
      });
      for (const diagnostic of page.diagnostics) {
        diagnostics.push({ ...diagnostic, file: path.relative(SRC_ROOT, file) });
      }
      walk(page.blocks, (block) => {
        if (block.t === 'callout') {
          counts.callout.set(block.tone, (counts.callout.get(block.tone) ?? 0) + 1);
        } else if (block.t === 'details') counts.details += 1;
        else if (block.t === 'code') counts.code += 1;
        else if (block.t === 'table') counts.table += 1;
        else if (block.t === 'heading') counts.heading += 1;
      });
    }

    const byKind: Record<string, number> = {};
    for (const diagnostic of diagnostics) byKind[diagnostic.kind] = (byKind[diagnostic.kind] ?? 0) + 1;
    console.log(
      JSON.stringify(
        { pages: files.length, callouts: Object.fromEntries(counts.callout), details: counts.details, code: counts.code, tables: counts.table, headings: counts.heading, diagnostics: byKind },
        null,
        2,
      ),
    );
    console.log(diagnostics.slice(0, 25).map((d) => `${d.kind}  ${d.file}:${d.line ?? ''}  ${d.message}`).join('\n'));

    expect(files.length).toBeGreaterThan(100);
    // What `git grep '^:::'` finds in the tracked pages, before parsing anything.
    // (A plain `grep -r` also reads the ignored `.vitepress/dist` copies and
    // counts every container twice.)
    expect(counts.callout.get('tip')).toBe(42);
    expect(counts.callout.get('warning')).toBe(38);
    expect(counts.details).toBe(26);
    expect(counts.callout.get('info')).toBe(3);
    expect(counts.callout.get('danger')).toBe(2);
    expect(counts.code).toBeGreaterThan(1000);
    // Every HTML block of the docs is a lesson row or a named component.
    expect(byKind['html-block'] ?? 0).toBe(0);
    // No import may point at a file or a region that is not there.
    expect(byKind['snippet-missing'] ?? 0).toBe(0);
    expect(byKind['snippet-region-missing'] ?? 0).toBe(0);
  }, 120_000);
});
