// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderMarkdownSource } from './source.ts';

let root: string;
let filePath: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'herbier-source-'));
  mkdirSync(path.join(root, 'snippets'));
  mkdirSync(path.join(root, 'guide'));
  filePath = path.join(root, 'guide', 'page.md');
  writeFileSync(
    path.join(root, 'snippets', 'counter.ts'),
    [
      '// #region counter',
      'const count = 1;',
      '// #endregion counter',
      'export {};',
    ].join('\n'),
  );
  writeFileSync(path.join(root, 'snippets', 'fenced.md'), 'Use ```ts to open a block.\n');
});

const render = (source: string) =>
  renderMarkdownSource(source, { srcRoot: root, filePath, url: 'https://x.dev/craft/guide/page.md' });

describe('renderMarkdownSource', () => {
  it('replaces the frontmatter with the url the Markdown is served at', () => {
    expect(render('---\ntitle: Hello\n---\n# Title\n\nBody.\n')).toBe(
      '---\nurl: https://x.dev/craft/guide/page.md\n---\n# Title\n\nBody.\n',
    );
  });

  it('keeps the description of the frontmatter, and nothing else of it', () => {
    expect(render('---\nlayout: home\ndescription: Start here.\n---\n# T\n')).toBe(
      '---\nurl: https://x.dev/craft/guide/page.md\ndescription: Start here.\n---\n# T\n',
    );
  });

  it('writes a code import out as the fenced block it stands for, with its title', () => {
    const out = render('# T\n\n<<< @/snippets/counter.ts#counter [counter.ts]\n\nAfter.');
    expect(out).toContain('```ts [counter.ts]\nconst count = 1;\n```\n\nAfter.');
    expect(out).not.toContain('<<<');
  });

  it('reads an import relative to the page, and the whole file when it has no region', () => {
    const out = render('<<< ../snippets/counter.ts');
    expect(out).toContain('```ts\nconst count = 1;\nexport {};\n```');
  });

  it('leaves an import it cannot resolve, and one inside a fenced block, as written', () => {
    const out = render('<<< @/snippets/missing.ts\n\n```md\n<<< @/snippets/counter.ts#counter\n```');
    expect(out).toContain('<<< @/snippets/missing.ts');
    expect(out).toContain('```md\n<<< @/snippets/counter.ts#counter\n```');
  });

  it('drops the lines that are only a layout tag or a component, and keeps what is between them', () => {
    const out = render(
      '<div style="display: flex">\n\n[Next](/a)\n\n</div>\n\n<AuthorNote />\n\nPress <kbd>Esc</kbd>.\n\n```html\n<div>kept</div>\n```',
    );
    expect(out).toContain('[Next](/a)');
    expect(out).toContain('Press <kbd>Esc</kbd>.');
    expect(out).toContain('```html\n<div>kept</div>\n```');
    expect(out).not.toContain('<AuthorNote');
    expect(out).not.toContain('display: flex');
  });

  it('opens a longer fence when the code contains backticks', () => {
    const out = render('<<< @/snippets/fenced.md');
    expect(out).toContain('````md\nUse ```ts to open a block.\n````');
  });
});
