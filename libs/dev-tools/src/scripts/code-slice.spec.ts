import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeDependencyGraph } from './dependency-graph';
import {
  createSliceIndex,
  fingerprintOf,
  merkleRoot,
  portableNodeId,
  sliceChange,
  sliceOf,
  sliceOfPortableNode,
} from './code-slice';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const STUBS = `
declare function craftService(...args: unknown[]): Record<string, (...args: never[]) => unknown>;
declare function craftComponent(...args: unknown[]): unknown;
declare function state(...args: unknown[]): unknown;
declare function query(...args: unknown[]): unknown;
declare function div(...args: unknown[]): unknown;
declare function button(...args: unknown[]): unknown;
`;

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-code-slice-'));
  temporaryDirectories.push(root);
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        strict: true,
        skipLibCheck: true,
      },
      include: ['./**/*.ts'],
    }),
    'utf8',
  );
  await Promise.all(
    Object.entries(files).map(([path, contents]) =>
      writeFile(join(root, path), `${STUBS}\n${contents}`, 'utf8'),
    ),
  );
  return root;
}

const analyze = (rootDir: string) =>
  analyzeDependencyGraph({ rootDir, tsConfigFilePath: 'tsconfig.json' });

const idsOf = (rootDir: string) =>
  analyze(rootDir)
    .nodes.map((node) => node.id.replace(rootDir, '<root>'))
    .sort();

describe('stable identifiers', () => {
  it('survives a block moving down the file', async () => {
    const before = await fixture({
      'app.ts': `
        export const counter = craftService({ name: 'counter' }, () => {
          const count = state('count', 0);
          const label = state('label', 'hello');
          return { count, label };
        });
      `,
    });
    const after = await fixture({
      'app.ts': `
        // Twenty lines of nothing, inserted above every declaration in the
        // file. Under the old scheme this renamed every node in it.
        //
        //
        //
        //
        //
        //
        //
        //
        //
        //
        //
        //
        //
        //
        //
        //
        export const counter = craftService({ name: 'counter' }, () => {
          const count = state('count', 0);
          const label = state('label', 'hello');
          return { count, label };
        });
      `,
    });

    expect(idsOf(after)).toEqual(idsOf(before));
    expect(idsOf(before).some((id) => id.includes('primitive:'))).toBe(true);
  });

  it('carries no line number in a primitive identifier', async () => {
    const root = await fixture({
      'app.ts': `
        export const counter = craftService({ name: 'counter' }, () => {
          const count = state('count', 0);
          return { count };
        });
      `,
    });
    const primitive = analyze(root).nodes.find(
      (node) => node.kind === 'primitive',
    );
    expect(primitive?.id).toContain(
      '#counter/craftService()/count/state:count/0',
    );
    expect(primitive?.id).not.toMatch(/:\d+$/);
    expect(primitive?.line).toBeTypeOf('number');
  });

  it('separates two primitives that agree on owner and name by an ordinal', async () => {
    const root = await fixture({
      'app.ts': `
        export const counter = craftService({ name: 'counter' }, () => {
          const first = [state('count', 0), state('count', 1)];
          return { first };
        });
      `,
    });
    const ids = analyze(root)
      .nodes.filter((node) => node.kind === 'primitive')
      .map((node) => node.id.slice(node.id.indexOf('#')));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('code slices', () => {
  const twoServices = {
    'app.ts': `
      export const counter = craftService({ name: 'counter' }, () => {
        const count = state('count', 0);
        return { count };
      });

      export const unrelated = craftService({ name: 'unrelated' }, () => {
        const other = state('other', 0);
        return { other };
      });
    `,
  };

  // The two fixtures live in different temporary directories, so the node ids
  // differ by their absolute path. The root is stripped before the fingerprint
  // is taken, which is what a repository-relative graph does.
  const fingerprintOfService = (root: string, label = 'counter') => {
    const graph = analyze(root);
    const index = createSliceIndex(graph);
    const service = graph.nodes.find((node) => node.label === label);
    const slice = sliceOf(index, service?.id ?? '');
    return fingerprintOf(
      Object.fromEntries(
        Object.entries(slice.leaves).map(([id, hash]) => [
          id.replace(root, '<root>'),
          hash,
        ]),
      ),
    );
  };

  it('keeps a node hash to itself when a sibling in the same file changes', async () => {
    const before = await fixture(twoServices);
    const after = await fixture({
      'app.ts': twoServices['app.ts'].replace(
        "state('other', 0)",
        "state('other', 999)",
      ),
    });

    const nodeHashes = (root: string) => {
      const graph = analyze(root);
      const counter = graph.nodes.find((node) => node.label === 'counter');
      const index = createSliceIndex(graph);
      return Object.fromEntries(
        Object.entries(sliceOf(index, counter?.id ?? '').leaves)
          .filter(([id]) => !id.startsWith('file:'))
          .map(([id, hash]) => [id.replace(root, '<root>'), hash]),
      );
    };

    // Node granularity holds: not one leaf of the closure moved.
    expect(nodeHashes(after)).toEqual(nodeHashes(before));
  });

  it('still invalidates on a same-file edit, because the file is a leaf too', async () => {
    const before = await fixture(twoServices);
    const after = await fixture({
      'app.ts': twoServices['app.ts'].replace(
        "state('other', 0)",
        "state('other', 999)",
      ),
    });

    // Deliberately coarser than the plan's task 2 asks for, and the reason is
    // the test below: the graph does not model plain declarations, so node
    // hashes alone let a real change through in silence. The plan's own
    // tie-breaker — coarse is acceptable, a single false negative is blocking —
    // decides it. The cost is a re-render the evidence comparison absorbs.
    expect(fingerprintOfService(after)).not.toBe(fingerprintOfService(before));
  });

  it('catches a plain helper the graph does not model at all', async () => {
    const withHelper = {
      'app.ts': `
        const initialCount = () => 40;

        export const counter = craftService({ name: 'counter' }, () => {
          const count = state('count', initialCount());
          return { count };
        });
      `,
    };
    const before = await fixture(withHelper);
    const after = await fixture({
      'app.ts': withHelper['app.ts'].replace('=> 40;', '=> 55;'),
    });

    // `initialCount` is not a craft primitive, so it is in no closure and has
    // no node hash. Under node hashes alone this edit changed the render and
    // moved no fingerprint — a missed regression, in silence, which is the one
    // failure mode the design says it will never accept.
    expect(fingerprintOfService(after)).not.toBe(fingerprintOfService(before));
  });

  it('moves when a node inside the closure changes', async () => {
    const before = await fixture(twoServices);
    const after = await fixture({
      'app.ts': twoServices['app.ts'].replace(
        "state('count', 0)",
        "state('count', 42)",
      ),
    });

    const slice = (root: string) => {
      const graph = analyze(root);
      const index = createSliceIndex(graph);
      const counter = graph.nodes.find((node) => node.label === 'counter');
      return sliceOf(index, counter?.id ?? '');
    };

    const [left, right] = [slice(before), slice(after)];
    expect(right.fingerprint).not.toBe(left.fingerprint);

    const strip = (leaves: Readonly<Record<string, string>>, root: string) =>
      Object.fromEntries(
        Object.entries(leaves).map(([id, hash]) => [
          id.replace(root, '<root>'),
          hash,
        ]),
      );
    const change = sliceChange(
      strip(left.leaves, before),
      strip(right.leaves, after),
    );
    expect(change.added).toEqual([]);
    expect(change.removed).toEqual([]);
    expect(change.changed.some((id) => id.includes('state:count'))).toBe(true);
  });

  it('follows what produces the node, not what the node produces', async () => {
    const root = await fixture({
      'app.ts': `
        export const counter = craftService({ name: 'counter' }, () => {
          const count = state('count', 0);
          return { count };
        });

        export const Widget = craftComponent('Widget', {}, () => {
          const { count } = counter();
          return { count };
        }, () => div({}, [button({ name: 'go' })]));
      `,
    });
    const graph = analyze(root);
    const index = createSliceIndex(graph);
    const widget = graph.nodes.find((node) => node.label === 'Widget');
    const service = graph.nodes.find((node) => node.label === 'counter');

    const componentSlice = sliceOf(index, widget?.id ?? '');
    const serviceSlice = sliceOf(index, service?.id ?? '');

    expect(componentSlice.nodes).toContain(widget?.id);
    // The service the component reads is an ingredient of the component…
    expect(componentSlice.nodes).toContain(service?.id);
    // …and the component that renders the service is not an ingredient of it.
    expect(serviceSlice.nodes).not.toContain(widget?.id);
  });

  it('resolves a portable node id to the same slice in another worktree', async () => {
    const root = await fixture({
      'app.ts': `
        export const Widget = craftComponent('Widget', {}, () => ({}), () => div());
      `,
    });
    const graph = analyze(root);
    const index = createSliceIndex(graph);
    const widget = graph.nodes.find((node) => node.label === 'Widget');
    const portable = portableNodeId(widget?.id ?? '', root);

    expect(portable).toContain('app.ts');
    expect(portable).not.toContain(root);
    expect(sliceOfPortableNode(index, portable, root)).toMatchObject({
      root: portable,
      nodes: [portable],
    });
  });
});

describe('merkle root', () => {
  it('is order-independent only through the caller sorting its leaves', () => {
    expect(merkleRoot(['a 1', 'b 2'])).not.toBe(merkleRoot(['b 2', 'a 1']));
    expect(merkleRoot(['a 1', 'b 2'])).toBe(merkleRoot(['a 1', 'b 2']));
  });

  it('changes when any single leaf changes', () => {
    const leaves = ['a 1', 'b 2', 'c 3', 'd 4', 'e 5'];
    const root = merkleRoot(leaves);
    for (let index = 0; index < leaves.length; index += 1) {
      const mutated = [...leaves];
      mutated[index] = `${mutated[index]}x`;
      expect(merkleRoot(mutated)).not.toBe(root);
    }
  });
});
