import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeDependencyGraph } from './dependency-graph.js';
import { createTemplateObligationIndex } from './template-obligations.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const STUBS = `
declare function craftComponent(...args: any[]): unknown;
declare function state(...args: any[]): any;
declare function div(...args: any[]): unknown;
declare function span(...args: any[]): unknown;
declare function button(...args: any[]): unknown;
`;

async function fixture(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-template-obligations-'));
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
  await writeFile(join(root, 'view.ts'), `${STUBS}\n${source}`, 'utf8');
  return root;
}

const indexFor = (rootDir: string) => {
  const graph = analyzeDependencyGraph({
    rootDir,
    tsConfigFilePath: 'tsconfig.json',
  });
  return createTemplateObligationIndex(graph, {
    rootDir,
    tsConfigFilePath: 'tsconfig.json',
  });
};

describe('template obligations', () => {
  it('derives one render promise per target and one command per handler target', async () => {
    const root = await fixture(`
      const Counter = craftComponent(
        'Counter',
        {},
        function* () {
          const count = yield* state('count', 0, ({ update }: any) => ({
            increment: () => update((value: number) => value + 1),
          }));
          return { count };
        },
        ({ count }) => div([
          span(function* () { return yield* count(); }),
          span(function* () { return yield* count(); }),
          button('add', { click: count.increment }, '+'),
        ]),
      );
    `);

    const index = indexFor(root);
    const renders = index.obligations.filter(
      (obligation) => obligation.direction === 'render',
    );
    const commands = index.obligations.filter(
      (obligation) => obligation.direction === 'command',
    );

    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({
      component: 'component:view.ts:Counter',
      targetKind: 'primitive',
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      element: 'button',
      elementName: 'add',
      targetKind: 'property',
    });
    expect(
      new Set(index.obligations.map((obligation) => obligation.subject)).size,
    ).toBe(index.obligations.length);
  });

  it('adds the template site and the target slice to the fingerprint leaves', async () => {
    const root = await fixture(`
      const Counter = craftComponent(
        'Counter', {},
        function* () {
          const count = yield* state('count', 0);
          return { count };
        },
        ({ count }) => span(function* () { return yield* count(); }),
      );
    `);
    const index = indexFor(root);
    const obligation = index.obligations[0];
    expect(obligation).toBeDefined();
    const leaves = index.leavesFor(
      obligation as NonNullable<typeof obligation>,
    );

    expect(Object.keys(leaves)).toContain(`site:${obligation?.subject}`);
    expect(Object.keys(leaves).some((key) => key.includes('state:count'))).toBe(
      true,
    );
    expect(
      index.fingerprintFor(obligation as NonNullable<typeof obligation>),
    ).toMatch(/^[a-f0-9]{32}$/);
  });

  it('reports a dynamic template reference as a known derivation hole', async () => {
    const root = await fixture(`
      const Dynamic = craftComponent(
        'Dynamic', {},
        function* () {
          const model = yield* state('model', { title: 'hello' });
          return { model };
        },
        ({ model }) => span(model['title']),
      );
    `);
    const index = indexFor(root);

    expect(index.diagnostics).toEqual([
      expect.objectContaining({ code: 'template-obligation-unresolved' }),
    ]);
  });
});
