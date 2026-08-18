import { describe, expect, it } from 'vitest';
import {
  assertServerFunctionArchitecture,
  createArchitectureGraph,
} from '@craft-ts/dev-tools/architecture-graph';
import { analyzeDependencyGraph } from '@craft-ts/dev-tools/dependency-graph';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createUsersClient } from './users/list.fn-client';
import { listenDemoServer } from './server/server';

const demoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('demo with server function', () => {
  it('calls the Effect backend through the client facade and local DB', async () => {
    const server = await listenDemoServer();
    try {
      const getUsers = createUsersClient(async ({ id, input }) => {
        const response = await fetch(`${server.url}/__server-functions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, input }),
        });
        const payload = (await response.json()) as unknown;
        if (!response.ok) throw new Error(JSON.stringify(payload));
        return payload;
      });

      const users = await getUsers({ filter: 'ada' });

      expect(users).toEqual([
        { id: 1, name: 'Ada Lovelace', email: 'ada@craft.dev' },
      ]);
      console.log(
        `server function demo: client -> ${server.url} -> Effect -> local DB`,
        users,
      );
    } finally {
      await server.close();
    }
  });

  it('is visible as a valid three-file server-function family', () => {
    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: demoRoot,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(graph.catalog.serverFunctionFamilies).toEqual(['demo.users.list']);
    expect(graph.serverFunctionFamily('demo.users.list').kind).toBe(
      'server-function-family',
    );
    expect(() => assertServerFunctionArchitecture(graph.graph)).not.toThrow();
  });
});
