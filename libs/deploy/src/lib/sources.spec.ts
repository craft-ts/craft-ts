import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectEnvironmentReads,
  isNodeBuiltin,
  readCraftModuleGraph,
} from './sources.js';
import {
  createTemporaryWorkspace,
  type TemporaryWorkspace,
} from './testing.fixture.js';

let workspace: TemporaryWorkspace;

beforeEach(() => {
  workspace = createTemporaryWorkspace();
});

afterEach(() => {
  workspace.dispose();
});

describe('readCraftModuleGraph', () => {
  it('reports an entry that does not exist', () => {
    const graph = readCraftModuleGraph(join(workspace.root, 'missing.ts'));

    expect(graph.missingEntry).toBe(join(workspace.root, 'missing.ts'));
    expect(graph.files).toEqual([]);
  });

  it('follows relative imports transitively', () => {
    const entry = workspace.write('src/a.ts', `import './b';\n`);
    workspace.write('src/b.ts', `import './c';\n`);
    workspace.write('src/c.ts', `export const c = 1;\n`);

    expect(readCraftModuleGraph(entry).files).toHaveLength(3);
  });

  it('resolves a TypeScript source behind an emitted `.js` specifier', () => {
    const entry = workspace.write('src/a.ts', `import './b.js';\n`);
    workspace.write('src/b.ts', `export const b = 1;\n`);

    expect(readCraftModuleGraph(entry).files).toHaveLength(2);
  });

  it('resolves a directory to its index module', () => {
    const entry = workspace.write('src/a.ts', `import './feature';\n`);
    workspace.write('src/feature/index.ts', `export const f = 1;\n`);

    expect(readCraftModuleGraph(entry).files).toHaveLength(2);
  });

  it('stops at the package boundary', () => {
    const entry = workspace.write(
      'src/a.ts',
      `import { x } from '@craft-ts/core';\nexport { x };\n`,
    );

    const graph = readCraftModuleGraph(entry);

    expect(graph.files).toHaveLength(1);
    expect(graph.imports.map((i) => i.specifier)).toEqual(['@craft-ts/core']);
  });

  it('reports the line of each import', () => {
    const entry = workspace.write(
      'src/a.ts',
      `const x = 1;\n\nimport { readFile } from 'node:fs';\n`,
    );

    expect(readCraftModuleGraph(entry).imports).toEqual([
      expect.objectContaining({ specifier: 'node:fs', line: 3 }),
    ]);
  });

  it('survives a cycle', () => {
    const entry = workspace.write('src/a.ts', `import './b';\n`);
    workspace.write('src/b.ts', `import './a';\n`);

    expect(readCraftModuleGraph(entry).files).toHaveLength(2);
  });
});

describe('isNodeBuiltin', () => {
  it('recognises both the prefixed and the bare form', () => {
    expect(isNodeBuiltin('node:fs/promises')).toBe(true);
    expect(isNodeBuiltin('http')).toBe(true);
  });

  it('leaves package specifiers alone', () => {
    expect(isNodeBuiltin('@craft-ts/core')).toBe(false);
    expect(isNodeBuiltin('./server')).toBe(false);
  });
});

describe('collectEnvironmentReads', () => {
  it('reads both the Node and the Worker shapes', () => {
    expect(
      collectEnvironmentReads(
        `process.env.API_URL; process.env['API_TOKEN']; env.KV_NAMESPACE;`,
      ),
    ).toEqual(['API_TOKEN', 'API_URL', 'KV_NAMESPACE']);
  });

  it('ignores the names every platform already provides', () => {
    expect(
      collectEnvironmentReads(
        `process.env.NODE_ENV; import.meta.env.PROD; import.meta.env.BASE_URL;`,
      ),
    ).toEqual([]);
  });

  it('ignores lower case properties, which are not variables', () => {
    expect(collectEnvironmentReads(`process.env.apiUrl;`)).toEqual([]);
  });
});
