import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore, graphStoreOptionsFromEnv } from './graph-store.js';

describe('GraphStore', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'graph-store-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true, skipLibCheck: true },
        include: ['src/**/*.ts'],
      }),
    );
    writeFileSync(
      join(root, 'src', 'panel.ts'),
      `declare function craftComponent(...args: unknown[]): unknown;
declare function state(...args: unknown[]): unknown;
export const Panel = craftComponent('Panel', {}, function* () {
  const open = yield* state('open', false);
  return { open };
});
`,
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const options = (overrides: Partial<Record<string, string>> = {}) =>
    graphStoreOptionsFromEnv(overrides, root);

  it('analyses the program when there is no graph file', () => {
    const store = new GraphStore(options());

    const loaded = store.get();

    expect(loaded.source).toBe('analysis');
    expect(loaded.graph.nodes.some((node) => node.label === 'Panel')).toBe(true);
    expect(store.freshness()).toEqual({ stale: false });
    expect(existsSync(join(root, 'craft-dependency-graph.json'))).toBe(false);
  });

  it('rebuilds to the graph file, reads it back, and detects a stale graph', () => {
    new GraphStore(options()).rebuild();
    const graphFile = join(root, 'craft-dependency-graph.json');
    expect(existsSync(graphFile)).toBe(true);

    const reader = new GraphStore(options());
    expect(reader.get().source).toBe('file');
    expect(reader.freshness().stale).toBe(false);

    const past = new Date(Date.now() - 60_000);
    utimesSync(graphFile, past, past);
    const outdated = new GraphStore(options());
    expect(outdated.freshness()).toEqual({
      stale: true,
      newestSource: expect.stringMatching(/panel\.ts$|tsconfig\.json$/),
    });

    outdated.rebuild();
    expect(outdated.freshness()).toEqual({ stale: false });
  });

  it('refuses to rebuild when read-only', () => {
    const store = new GraphStore(options({ CRAFT_GRAPH_READONLY: '1' }));

    expect(() => store.rebuild()).toThrow('CRAFT_GRAPH_READONLY');
  });

  it('reads its configuration from the environment', () => {
    writeFileSync(join(root, 'tsconfig.app.json'), '{ "extends": "./tsconfig.json" }');

    expect(options({ CRAFT_GRAPH_FILE: 'out/graph.json' })).toEqual({
      rootDir: root,
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      graphFile: join(root, 'out', 'graph.json'),
      readonly: false,
    });
    expect(
      options({ CRAFT_GRAPH_TSCONFIG: 'tsconfig.json', CRAFT_GRAPH_READONLY: 'true' }),
    ).toMatchObject({ tsConfigFilePath: join(root, 'tsconfig.json'), readonly: true });
  });

  it('explains what to set when there is neither a graph nor a tsconfig', () => {
    rmSync(join(root, 'tsconfig.json'));

    expect(() => new GraphStore(options()).get()).toThrow('CRAFT_GRAPH_TSCONFIG');
  });

  it('applies a coverage report on load', () => {
    writeFileSync(
      join(root, 'coverage-final.json'),
      JSON.stringify({
        [join(root, 'src', 'panel.ts')]: {
          statementMap: {
            0: { start: { line: 4, column: 2 }, end: { line: 4, column: 40 } },
          },
          s: { 0: 1 },
        },
      }),
    );
    const store = new GraphStore(
      options({ CRAFT_GRAPH_COVERAGE: 'coverage-final.json' }),
    );

    const covered = store
      .get()
      .graph.nodes.filter((node) => node.metrics?.coverage);

    expect(covered.length).toBeGreaterThan(0);
    expect(
      covered.reduce((sum, node) => sum + (node.metrics?.coverage?.covered ?? 0), 0),
    ).toBe(1);
  });

  it('explains a missing coverage report', () => {
    const store = new GraphStore(options({ CRAFT_GRAPH_COVERAGE: 'nope.json' }));

    expect(() => store.get()).toThrow('vitest run --coverage');
  });
});
