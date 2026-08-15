import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docsRoot = fileURLToPath(new URL('..', import.meta.url));
const snippetsRoot = join(docsRoot, 'tests/snippets');

const SNIPPET_IMPORT = /^<<<\s+@\/([^\s#{]+)(?:#([^\s{#]+))?/gm;
const REGION_LINE = /^\/\/ ?#?((?:end)?region) ([\w*-]+)$/;

const walk = (dir: string, predicate: (name: string) => boolean): string[] => {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(path, predicate);
    }
    return predicate(entry.name) ? [path] : [];
  });
};

const parseImports = (markdown: string) =>
  [...markdown.matchAll(SNIPPET_IMPORT)].map((match) => ({
    file: match[1] ?? '',
    region: match[2],
  }));

const extractRegion = (source: string, regionName: string) => {
  const lines = source.split('\n');
  let start = -1;

  for (const [index, line] of lines.entries()) {
    const match = REGION_LINE.exec(line.trim());
    if (start < 0 && match?.[1] === 'region' && match[2] === regionName) {
      start = index + 1;
      continue;
    }
    if (start >= 0 && match?.[1] === 'endregion' && match[2] === regionName) {
      return lines.slice(start, index).join('\n');
    }
  }

  return null;
};

const parseRegions = (source: string) =>
  source
    .split('\n')
    .flatMap((line) => {
      const match = REGION_LINE.exec(line.trim());
      return match?.[1] === 'region' && match[2] ? [match[2]] : [];
    });

describe('docs snippet imports', () => {
  it('resolves every VitePress snippet import to an existing region', () => {
    const missing = walk(docsRoot, (name) => name.endsWith('.md')).flatMap(
      (markdownPath) => {
        const from = relative(docsRoot, markdownPath);
        return parseImports(readFileSync(markdownPath, 'utf8')).flatMap(
          ({ file, region }) => {
            const abs = join(docsRoot, file);
            if (!existsSync(abs)) {
              return [`${from} → ${file} (missing file)`];
            }
            if (
              region &&
              extractRegion(readFileSync(abs, 'utf8'), region) === null
            ) {
              return [`${from} → ${file}#${region} (missing VitePress region)`];
            }
            return [];
          },
        );
      },
    );

    expect(missing).toEqual([]);
  });

  it('does not leave unreferenced regions in tests/snippets', () => {
    const referenced = new Set(
      walk(docsRoot, (name) => name.endsWith('.md')).flatMap((markdownPath) =>
        parseImports(readFileSync(markdownPath, 'utf8')).map(
          ({ file, region }) => `${file}#${region ?? ''}`,
        ),
      ),
    );

    const unused = walk(snippetsRoot, (name) => name.endsWith('.ts')).flatMap(
      (specPath) => {
        const file = relative(docsRoot, specPath).replaceAll('\\', '/');
        return parseRegions(readFileSync(specPath, 'utf8'))
          .filter((region) => !referenced.has(`${file}#${region}`))
          .map((region) => `${file}#${region}`);
      },
    );

    expect(unused).toEqual([]);
  });
});

describe('learn/01-first-state snippet imports', () => {
  const content = readFileSync(
    new URL('../learn/01-first-state.md', import.meta.url),
    'utf8',
  );

  it('imports the Tasks component from a tested snippet region', () => {
    expect(content).toContain(
      '<<< @/tests/snippets/learn/01-first-state/tasks-component.spec.ts#tasks-component',
    );
    expect(content).not.toContain('export const Tasks = craftComponent(');
  });

  it('keeps the Tasks region free of the test harness', () => {
    const region = extractRegion(
      readFileSync(
        new URL(
          './snippets/learn/01-first-state/tasks-component.spec.ts',
          import.meta.url,
        ),
        'utf8',
      ),
      'tasks-component',
    );

    expect(region).toContain('export const Tasks = craftComponent(');
    expect(region).not.toContain('beforeAll');
    expect(region).not.toContain('#region');
    expect(region).not.toContain('@vitest-environment');
  });

  it('imports the UserCard component from a tested snippet region', () => {
    expect(content).toContain(
      '<<< @/tests/snippets/learn/01-first-state/user-card.spec.ts#user-card',
    );
    expect(content).not.toContain("const UserCard = craftComponent(");
  });
});
