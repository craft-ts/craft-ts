// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCodeHighlighter, kindOfScopes, extractMarkers } from './highlight.ts';
import { parsePage } from './parse.ts';
import { extractRegion, parseSnippetDirective, parseLineRanges } from './snippet.ts';
import type { Block, CodeBlock } from './tree.ts';

let root: string;
let highlighter: Awaited<ReturnType<typeof createCodeHighlighter>>;

beforeAll(async () => {
  highlighter = await createCodeHighlighter();
  root = mkdtempSync(path.join(tmpdir(), 'herbier-md-'));
  mkdirSync(path.join(root, 'snippets'));
  writeFileSync(
    path.join(root, 'snippets', 'counter.ts'),
    [
      "import { state } from '@craft-ts/core';",
      '// #region counter',
      'const count = yield* state(0);',
      '// #region inner',
      'count.set(1);',
      '// #endregion inner',
      'return count;',
      '// #endregion counter',
      'export {};',
    ].join('\n'),
  );
});
afterAll(() => highlighter.dispose());

const parse = (source: string) =>
  parsePage(source, { srcRoot: root, highlighter });
const first = async (source: string): Promise<Block> =>
  (await parse(source)).blocks[0] as Block;

describe('containers', () => {
  it.each([
    ['info', 'info'],
    ['tip', 'tip'],
    ['warning', 'warning'],
    ['danger', 'danger'],
  ] as const)('maps ::: %s onto the %s callout', async (name, tone) => {
    const block = await first(`::: ${name}\nHello **world**\n:::\n`);
    expect(block).toMatchObject({ t: 'callout', tone, caption: '' });
  });

  it('keeps a custom title, and accepts the :::warning typo the docs contain', async () => {
    expect(await first('::: tip New to the shape?\nBody\n:::')).toMatchObject({
      t: 'callout',
      tone: 'tip',
      caption: 'New to the shape?',
    });
    expect(await first(':::warning\nBody\n:::')).toMatchObject({
      t: 'callout',
      tone: 'warning',
    });
  });

  it('parses ::: details with its summary and nested blocks', async () => {
    const block = await first('::: details Show more\n- one\n- two\n:::');
    expect(block).toMatchObject({ t: 'details', summary: 'Show more' });
    expect((block as { children: readonly Block[] }).children[0]).toMatchObject({
      t: 'list',
      ordered: false,
    });
  });

  it('reports a container it has no component for, and keeps its content', async () => {
    const page = await parse('::: columns\ntext\n:::');
    expect(page.diagnostics.map((d) => d.kind)).toEqual(['unknown-container']);
    expect(page.blocks[0]).toMatchObject({ t: 'raw' });
  });

  it('keeps the content of a code group that holds no code, and says so', async () => {
    const page = await parse('::: code-group\ntext\n:::');
    expect(page.diagnostics.map((d) => d.kind)).toEqual(['code-group']);
    expect(page.blocks[0]).toMatchObject({ t: 'raw' });
  });
});

describe('GitHub alerts', () => {
  it.each([
    ['NOTE', 'info'],
    ['TIP', 'tip'],
    ['IMPORTANT', 'important'],
    ['WARNING', 'warning'],
    ['CAUTION', 'danger'],
  ] as const)('maps > [!%s] onto %s and strips the marker', async (name, tone) => {
    const block = (await first(`> [!${name}]\n> Careful here.`)) as Extract<
      Block,
      { t: 'callout' }
    >;
    expect(block.tone).toBe(tone);
    const paragraph = block.children[0] as Extract<Block, { t: 'paragraph' }>;
    expect(JSON.stringify(paragraph.children)).toContain('Careful here.');
    expect(JSON.stringify(paragraph.children)).not.toContain('[!');
  });

  it('leaves an ordinary quote alone', async () => {
    expect(await first('> just a quote')).toMatchObject({ t: 'quote' });
  });
});

describe('code', () => {
  it('tokenises a fence with the closed set of word kinds', async () => {
    const block = (await first('```ts\nconst a = 1; // hi\n```')) as CodeBlock;
    const kinds = block.lines[0]!.tokens.map((token) => token.kind);
    expect(block.language).toBe('ts');
    expect(kinds).toContain('keyword');
    expect(kinds).toContain('number');
    expect(kinds).toContain('comment');
  });

  it('reads the fence meta: highlighted lines, line numbers, a title', async () => {
    const block = (await first(
      '```ts{2} :line-numbers [counter.ts]\na();\nb();\nc();\n```',
    )) as CodeBlock;
    expect(block.numbered).toBe(true);
    expect(block.filename).toBe('counter.ts');
    expect(block.lines.map((line) => line.mark)).toEqual([undefined, 'highlight', undefined]);
  });

  it('turns [!code …] markers into marks and dims the rest around a focus', async () => {
    const block = (await first(
      '```ts\nconst a = 1; // [!code ++]\nconst b = 2; // [!code --]\nconst c = 3; // [!code focus]\nconst d = 4;\n```',
    )) as CodeBlock;
    expect(block.lines.map((line) => line.mark)).toEqual(['add', 'remove', undefined, 'dim']);
    expect(JSON.stringify(block.lines)).not.toContain('[!code');
  });

  it('renders an unknown language as plain text and says so', async () => {
    const page = await parse('```klingon\nqapla\n```');
    expect(page.diagnostics.map((d) => d.kind)).toEqual(['unknown-language']);
    expect((page.blocks[0] as CodeBlock).lines[0]!.tokens).toEqual([{ text: 'qapla' }]);
  });

  it('imports a region with <<<, without the region markers', async () => {
    const block = (await first('<<< @/snippets/counter.ts#counter')) as CodeBlock;
    const text = block.lines.map((line) => line.tokens.map((t) => t.text).join(''));
    expect(text).toEqual(['const count = yield* state(0);', 'count.set(1);', 'return count;']);
    expect(block.language).toBe('ts');
  });

  it('imports a whole file and highlights lines of the import', async () => {
    const block = (await first('<<< @/snippets/counter.ts{1}')) as CodeBlock;
    expect(block.lines[0]!.mark).toBe('highlight');
    expect(block.lines.length).toBe(5);
  });

  it('reports a missing file or region instead of throwing', async () => {
    const missing = await parse('<<< @/snippets/nope.ts');
    expect(missing.diagnostics.map((d) => d.kind)).toEqual(['snippet-missing']);
    const region = await parse('<<< @/snippets/counter.ts#nope');
    expect(region.diagnostics.map((d) => d.kind)).toEqual(['snippet-region-missing']);
  });
});

describe('prose', () => {
  it('gives headings unique anchors and collects an h2/h3 outline', async () => {
    const page = await parse('# Title\n\n## Same\n\n### Same\n\n## Same\n');
    const ids = page.blocks.map((b) => (b.t === 'heading' ? b.id : ''));
    expect(ids).toEqual(['title', 'same', 'same-1', 'same-2']);
    expect(page.outline.map((o) => o.level)).toEqual([2, 3, 2]);
  });

  it('marks links external, keeps inline code, kbd and emphasis', async () => {
    const block = (await first(
      'See [guide](/guide/x), [npm](https://npmjs.com), `code`, <kbd>Esc</kbd>, **bold** and *soft*.',
    )) as Extract<Block, { t: 'paragraph' }>;
    const kinds = block.children.map((node) => node.t);
    expect(kinds).toEqual(expect.arrayContaining(['link', 'code', 'kbd', 'strong', 'em']));
    const links = block.children.filter((node) => node.t === 'link');
    expect(links.map((l) => (l.t === 'link' ? l.external : null))).toEqual([false, true]);
  });

  it('parses tables and ordered lists', async () => {
    const page = await parse('| a | b |\n|---|---|\n| 1 | 2 |\n\n1. one\n2. two\n');
    expect(page.blocks[0]).toMatchObject({ t: 'table' });
    expect((page.blocks[0] as Extract<Block, { t: 'table' }>).head).toHaveLength(2);
    expect(page.blocks[1]).toMatchObject({ t: 'list', ordered: true });
  });

  it('reads scalar frontmatter', async () => {
    const page = await parse('---\nlayout: home\noutline: false\n---\n# Hi');
    expect(page.frontmatter).toEqual({ layout: 'home', outline: false });
  });

  it('reports HTML it has no component for', async () => {
    const page = await parse('<table><tr><td>x</td></tr></table>\n\nand <span>inline</span>');
    expect(page.diagnostics.map((d) => d.kind)).toEqual(['html-block', 'html-inline', 'html-inline']);
  });

  it('turns the lesson navigation <div> into a row, keeping its links', async () => {
    const page = await parse(
      '<div style="display: flex; justify-content: space-between; margin-top: 2rem">\n\n[← Overview](/learn/)\n\n[2. Derive →](/learn/02)\n\n</div>',
    );
    expect(page.diagnostics).toEqual([]);
    expect(page.blocks[0]).toMatchObject({ t: 'row', layout: 'between' });
    expect((page.blocks[0] as Extract<Block, { t: 'row' }>).children).toHaveLength(2);
  });

  it('turns a <div class> wrapping one <img> into a figure with a variant', async () => {
    const page = await parse('<div class="logo"><img src="/a.png" alt="A" /></div>');
    expect(page.diagnostics).toEqual([]);
    expect(page.blocks[0]).toEqual({ t: 'figure', src: '/a.png', alt: 'A', variant: 'logo' });
  });

  it('names a component used on its own line, for the app to resolve', async () => {
    const page = await parse('<AuthorNote />\n\n<Other />');
    expect(page.blocks).toEqual([
      { t: 'component', name: 'AuthorNote' },
      { t: 'component', name: 'Other' },
    ]);
  });
});

describe('helpers', () => {
  it('parses line ranges and snippet directives', () => {
    expect(parseLineRanges('1,3-5')).toEqual([1, 3, 4, 5]);
    expect(parseSnippetDirective('<<< @/a/b.ts#region{2-3} ts [title]')).toEqual({
      path: '@/a/b.ts',
      region: 'region',
      highlight: [2, 3],
      language: 'ts',
      title: 'title',
    });
  });

  it('extracts nested regions and whole files', () => {
    const source = '// #region a\nx\n// #region b\ny\n// #endregion b\nz\n// #endregion a\nw';
    expect(extractRegion(source, 'a').lines).toEqual(['x', 'y', 'z']);
    expect(extractRegion(source).lines).toEqual(['x', 'y', 'z', 'w']);
    expect(extractRegion(source, 'nope').found).toBe(false);
  });

  it('maps the narrowest scope to a kind, and strips markers', () => {
    expect(kindOfScopes(['source.ts', 'meta.function-call.ts', 'entity.name.function.ts'])).toBe('function');
    expect(kindOfScopes(['source.ts'])).toBeUndefined();
    expect(extractMarkers(['a // [!code ++]', 'b']).marks).toEqual(['add', undefined]);
  });
});

describe('code groups', () => {
  it('turns ::: code-group into one group of tabs named by the fence labels', async () => {
    const page = await parse(
      [
        '::: code-group',
        '',
        '```sh [npm]',
        'npm install @craft-ts/core',
        '```',
        '',
        '```sh [pnpm]',
        'pnpm add @craft-ts/core',
        '```',
        '',
        ':::',
      ].join('\n'),
    );

    expect(page.blocks).toHaveLength(1);
    const group = page.blocks[0];
    expect(group?.t).toBe('codeGroup');
    if (group?.t === 'codeGroup') {
      expect(group.tabs.map((tab) => tab.label)).toEqual(['npm', 'pnpm']);
    }
    expect(page.diagnostics).toEqual([]);
  });
});
