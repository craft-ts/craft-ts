import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzeDependencyGraph,
  type DependencyGraphCollector,
} from './dependency-graph';
import { createArchitectureGraph } from './architecture-graph';

declare module './dependency-graph' {
  interface DependencyGraphNodeRegistry {
    'test-backend-node': { backend: 'test'; schemaVersion: number };
  }

  interface DependencyGraphEdgeRegistry {
    'test-uses': { reason: string };
  }
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('extensible dependency graph contract', () => {
  it('merges an explicitly enabled typed collector and exposes typed queries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-graph-extension-'));
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
    await writeFile(join(root, 'app.ts'), 'export const app = true;\n', 'utf8');

    const collector: DependencyGraphCollector = {
      name: 'test-backend',
      collect() {
        return {
          nodes: [
            {
              id: 'test:source',
              kind: 'test-backend-node',
              label: 'Test source',
              details: { backend: 'test', schemaVersion: 1 },
            },
            {
              id: 'test:target',
              kind: 'test-backend-node',
              label: 'Test target',
              details: { backend: 'test', schemaVersion: 1 },
            },
          ],
          edges: [
            {
              from: 'test:source',
              to: 'test:target',
              kind: 'test-uses',
              evidence: 'ast',
              details: { reason: 'fixture' },
              proof: {
                filePath: join(root, 'app.ts'),
                line: 1,
                pattern: 'app',
              },
            },
          ],
        };
      },
    };

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
        collectors: [collector],
      }),
    );

    const backend = graph.nodes('test-backend-node');
    const version: number = backend[0]!.details!.schemaVersion;
    const reason: string = graph.edges('test-uses')[0]!.details!.reason;
    expect(version).toBe(1);
    expect(reason).toBe('fixture');
    expect(graph.pathsBetween('test:source', 'test:target')[0]!.proofs).toEqual(
      [expect.objectContaining({ pattern: 'app' })],
    );
  });

  it('does not run a collector merely because its type is imported', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-graph-extension-'));
    temporaryDirectories.push(root);
    await writeFile(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext' },
        include: ['./**/*.ts'],
      }),
      'utf8',
    );
    await writeFile(join(root, 'app.ts'), 'export const app = true;\n', 'utf8');

    let called = false;
    const collector: DependencyGraphCollector = {
      name: 'disabled-backend',
      collect() {
        called = true;
        return {};
      },
    };

    analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });
    expect(called).toBe(false);
    expect(collector.name).toBe('disabled-backend');
  });
});
