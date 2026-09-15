import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { DependencyGraph } from '@craft-ts/dev-tools/dependency-graph';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from './graph-store.js';
import { createGraphMcpServer } from './mcp-server.js';

function fixtureGraph(root: string): DependencyGraph {
  const file = (name: string) => join(root, 'src', name);
  return {
    version: 1,
    rootDir: root,
    tsConfigFilePath: join(root, 'tsconfig.json'),
    nodes: [
      {
        id: `route:${file('app.routes.ts')}:home`,
        kind: 'route',
        label: 'home',
        filePath: file('app.routes.ts'),
        line: 1,
      },
      {
        id: `component:${file('home.ts')}:Home`,
        kind: 'component',
        label: 'Home',
        filePath: file('home.ts'),
        line: 1,
        endLine: 3,
        metrics: { cyclomaticOwn: 2, cyclomaticTotal: 2, lines: 3, fanIn: 1, fanOut: 1 },
      },
      {
        id: `component:${file('profile.ts')}:Profile`,
        kind: 'component',
        label: 'Profile',
        filePath: file('profile.ts'),
        line: 1,
      },
      {
        id: `service:${file('user.service.ts')}:UserService`,
        kind: 'service',
        label: 'UserService',
        filePath: file('user.service.ts'),
        line: 1,
        metrics: { cyclomaticOwn: 1, cyclomaticTotal: 4, lines: 9, fanIn: 2, fanOut: 0 },
      },
      {
        id: `primitive:${file('user.service.ts')}#query:users`,
        kind: 'primitive',
        label: 'query:users',
        filePath: file('user.service.ts'),
        line: 3,
      },
    ],
    edges: [
      {
        from: `route:${file('app.routes.ts')}:home`,
        to: `component:${file('home.ts')}:Home`,
        kind: 'loads',
        evidence: 'ast',
      },
      {
        from: `component:${file('home.ts')}:Home`,
        to: `service:${file('user.service.ts')}:UserService`,
        kind: 'depends-on',
        evidence: 'type',
        proof: { filePath: file('home.ts'), line: 2, symbol: 'injectUserService' },
      },
      {
        from: `component:${file('profile.ts')}:Profile`,
        to: `service:${file('user.service.ts')}:UserService`,
        kind: 'depends-on',
        evidence: 'type',
      },
      {
        from: `service:${file('user.service.ts')}:UserService`,
        to: `primitive:${file('user.service.ts')}#query:users`,
        kind: 'contains',
        evidence: 'ast',
      },
    ],
  };
}

describe('graph MCP server', () => {
  let root: string;
  let graph: DependencyGraph;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'graph-mcp-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src', 'home.ts'),
      'export const Home = craftComponent(\n  injectUserService,\n);\n// after\n',
    );
    graph = fixtureGraph(root);
    writeFileSync(join(root, 'craft-dependency-graph.json'), JSON.stringify(graph));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function connect(readonly = false): Promise<Client> {
    const store = new GraphStore({
      rootDir: root,
      graphFile: join(root, 'craft-dependency-graph.json'),
      readonly,
      analyze: () => graph,
    });
    const server = createGraphMcpServer(store);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    return client;
  }

  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, any>> {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) {
      throw new Error(JSON.stringify(result.content));
    }
    return result.structuredContent as Record<string, any>;
  }

  it('exposes the graph tools, and hides rebuild when read-only', async () => {
    const tools = (await (await connect()).listTools()).tools.map(({ name }) => name);
    expect(tools).toEqual([
      'graph.status',
      'graph.rebuild',
      'graph.search',
      'graph.node',
      'graph.neighbors',
      'graph.path',
      'graph.impact',
      'graph.hotspots',
      'graph.report',
      'graph.violations',
    ]);

    const readonlyTools = (await (await connect(true)).listTools()).tools.map(
      ({ name }) => name,
    );
    expect(readonlyTools).not.toContain('graph.rebuild');
  });

  it('reports status, with unknown staleness when there is no tsconfig', async () => {
    const status = await call(await connect(), 'graph.status');

    expect(status).toMatchObject({
      stale: 'unknown',
      source: 'file',
      nodes: 5,
      edges: 4,
      nodesByKind: { component: 2, primitive: 1, route: 1, service: 1 },
    });
  });

  it('searches with exact and prefix matches first, and signals truncation', async () => {
    const client = await connect();

    const found = await call(client, 'graph.search', { text: 'user' });
    expect(found['nodes'].map((node: { label: string }) => node.label)).toEqual([
      'UserService',
      'query:users',
    ]);

    const limited = await call(client, 'graph.search', { text: 'user', limit: 1 });
    expect(limited).toMatchObject({ total: 2, truncated: true });
  });

  it('returns a node with its relations, proofs and source', async () => {
    const result = await call(await connect(), 'graph.node', {
      label: 'Home',
      includeSource: true,
    });

    expect(result['node']).toMatchObject({
      label: 'Home',
      location: 'src/home.ts:1',
      metrics: { cyclomaticTotal: 2 },
    });
    expect(result['incoming']).toEqual([
      expect.objectContaining({ kind: 'loads', node: expect.objectContaining({ label: 'home' }) }),
    ]);
    expect(result['outgoing']).toEqual([
      expect.objectContaining({
        kind: 'depends-on',
        proof: { location: 'src/home.ts:2', symbol: 'injectUserService' },
      }),
    ]);
    expect(result['source']).toMatchObject({
      location: 'src/home.ts:1-3',
      code: 'export const Home = craftComponent(\n  injectUserService,\n);',
      truncated: false,
    });
  });

  it('accepts portable ids and reports an unknown node as an error', async () => {
    const client = await connect();

    const result = await call(client, 'graph.node', {
      id: 'service:src/user.service.ts:UserService',
    });
    expect(result['node'].label).toBe('UserService');

    const missing = await client.callTool({
      name: 'graph.node',
      arguments: { id: 'service:nope' },
    });
    expect(missing.isError).toBe(true);
  });

  it('walks neighbours in one direction', async () => {
    const result = await call(await connect(), 'graph.neighbors', {
      id: 'service:src/user.service.ts:UserService',
      direction: 'in',
    });

    expect(result['nodes'].map((node: { label: string }) => node.label)).toEqual([
      'UserService',
      'Home',
      'Profile',
    ]);
    expect(result['edges']).toHaveLength(2);
  });

  it('finds the shortest path with its proofs', async () => {
    const result = await call(await connect(), 'graph.path', {
      from: 'route:src/app.routes.ts:home',
      to: 'service:src/user.service.ts:UserService',
    });

    expect(result).toMatchObject({ reachable: true, total: 1 });
    expect(result['paths'][0]['nodes'].map((node: { label: string }) => node.label)).toEqual([
      'home',
      'Home',
      'UserService',
    ]);
    expect(result['paths'][0]['edges'][1]['proof']).toEqual({
      location: 'src/home.ts:2',
      symbol: 'injectUserService',
    });

    const backwards = await call(await connect(), 'graph.path', {
      from: 'service:src/user.service.ts:UserService',
      to: 'route:src/app.routes.ts:home',
    });
    expect(backwards).toMatchObject({ reachable: false, paths: [] });
  });

  it('lists the impact of a node through the slice relations', async () => {
    const result = await call(await connect(), 'graph.impact', {
      id: 'primitive:src/user.service.ts#query:users',
    });

    expect(result['impacted'].map((node: { label: string }) => node.label)).toEqual([
      'Home',
      'Profile',
      'home',
      'UserService',
    ]);
  });

  it('returns hotspots, the report and the violations', async () => {
    const client = await connect();

    const hotspots = await call(client, 'graph.hotspots');
    expect(hotspots['godNodes'][0]).toMatchObject({ label: 'UserService', fanIn: 2 });

    const report = await call(client, 'graph.report');
    expect(report).toMatchObject({ version: 1, summary: { nodes: 5 } });

    const violations = await call(client, 'graph.violations');
    expect(violations).toMatchObject({ stale: 'unknown' });
    expect(Array.isArray(violations['rules'])).toBe(true);
  });
});
