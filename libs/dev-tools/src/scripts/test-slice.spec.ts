import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestSliceIndex, movedNodes } from './test-slice';

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
declare function state(...args: unknown[]): unknown;
declare function describe(name: string, body: () => void): void;
declare function it(name: string, body: () => void): void;
declare function expect(value: unknown): { toBe(other: unknown): void };
`;

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-test-slice-'));
  temporaryDirectories.push(root);
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
      },
      include: ['./**/*.ts'],
    }),
    'utf8',
  );
  await writeFile(join(root, 'stubs.ts'), STUBS, 'utf8');
  await Promise.all(
    Object.entries(files).map(([path, contents]) =>
      writeFile(join(root, path), contents, 'utf8'),
    ),
  );
  return root;
}

const SOURCE = `
import './stubs.js';

export const counter = craftService({ name: 'counter' }, () => {
  const count = state('count', 0);
  return { count };
});
`;

const SPEC = `
import './stubs.js';
import { counter } from './app.js';

describe('counter', () => {
  it('starts at zero', () => {
    expect(counter).toBe(counter);
  });

  it('is a service', () => {
    expect(typeof counter).toBe('function');
  });
});
`;

const indexFor = (root: string) =>
  createTestSliceIndex({ rootDir: root, tsConfigFilePath: 'tsconfig.json' });

describe('createTestSliceIndex', () => {
  it('finds the spec files and names every test', async () => {
    const root = await fixture({ 'app.ts': SOURCE, 'app.spec.ts': SPEC });
    const index = indexFor(root);
    expect(index.specFiles).toEqual(['app.spec.ts']);
    expect(
      Object.keys(index.leavesFor('app.spec.ts', 'counter > starts at zero')),
    ).toContain('body:app.spec.ts#counter > starts at zero');
  });

  it('leaves a sibling test alone when one test body is edited', async () => {
    const before = await fixture({ 'app.ts': SOURCE, 'app.spec.ts': SPEC });
    const after = await fixture({
      'app.ts': SOURCE,
      'app.spec.ts': SPEC.replace(
        'expect(counter).toBe(counter);',
        'expect(counter).toBe(counter); // edited',
      ),
    });

    const [left, right] = [indexFor(before), indexFor(after)];
    expect(
      right.fingerprintFor('app.spec.ts', 'counter > starts at zero'),
    ).not.toBe(left.fingerprintFor('app.spec.ts', 'counter > starts at zero'));
    // The neighbour is untouched: a file-level hash would have moved it too,
    // and the register would be worthless on the first spec anyone edits.
    expect(right.fingerprintFor('app.spec.ts', 'counter > is a service')).toBe(
      left.fingerprintFor('app.spec.ts', 'counter > is a service'),
    );
  });

  it('moves every test of the file when the code under test moves', async () => {
    const before = await fixture({ 'app.ts': SOURCE, 'app.spec.ts': SPEC });
    const after = await fixture({
      'app.ts': SOURCE.replace("state('count', 0)", "state('count', 7)"),
      'app.spec.ts': SPEC,
    });

    const [left, right] = [indexFor(before), indexFor(after)];
    for (const name of ['counter > starts at zero', 'counter > is a service']) {
      expect(right.fingerprintFor('app.spec.ts', name)).not.toBe(
        left.fingerprintFor('app.spec.ts', name),
      );
    }

    const moved = movedNodes(
      left.leavesFor('app.spec.ts', 'counter > is a service'),
      right.leavesFor('app.spec.ts', 'counter > is a service'),
    );
    expect(moved.some((id) => id.includes('state:count'))).toBe(true);
  });

  it('falls back to the whole file for a test whose name is not a literal', async () => {
    const root = await fixture({
      'app.ts': SOURCE,
      'app.spec.ts': `
        import './stubs.js';
        const index = 1;
        it(\`case \${index}\`, () => { expect(index).toBe(1); });
      `,
    });
    const leaves = indexFor(root).leavesFor('app.spec.ts', 'case 1');
    expect(leaves['body:app.spec.ts#case 1']).toMatch(/^file:/);
  });
});
