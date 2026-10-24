import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import type { DependencyGraph } from './dependency-graph.js';
import {
  collectRouteNavigations,
  routePathParamNavigationFindings,
} from './route-path-param-navigation.js';

describe('route path-param navigation architecture rule', () => {
  it('reports a same-route param update when its service is route-provided', () => {
    const { graph, project } = graphFor();
    const nodes = collect(graph, project);

    expect(nodes.map((node) => node.details?.['scope'])).toEqual(['route']);
    expect(routePathParamNavigationFindings({
      ...graph,
      nodes: [...graph.nodes, ...nodes],
    })).toEqual([
      expect.objectContaining({
        target: 'users.ts:4',
        message: expect.stringContaining(
          "targets its own route 'users/:userId' to update :userId",
        ),
      }),
    ]);
  });

  it('allows an app-level navigation because the route helper is unavailable', () => {
    const { graph, project } = graphFor({ provideServiceOnComponent: false });
    const nodes = collect(graph, project);

    expect(nodes.map((node) => node.details?.['scope'])).toEqual(['outside']);
    expect(
      routePathParamNavigationFindings({ ...graph, nodes: [...graph.nodes, ...nodes] }),
    ).toEqual([]);
  });

  it('allows a service shared by multiple route contexts as ambiguous', () => {
    const { graph, project } = graphFor({ secondOwnerRoute: true });
    const nodes = collect(graph, project);

    expect(nodes.map((node) => node.details?.['scope'])).toEqual(['ambiguous']);
    expect(
      routePathParamNavigationFindings({ ...graph, nodes: [...graph.nodes, ...nodes] }),
    ).toEqual([]);
  });
});

function graphFor(options: {
  provideServiceOnComponent?: boolean;
  secondOwnerRoute?: boolean;
} = {}): { graph: DependencyGraph; project: Project } {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(
    '/demo/users.ts',
    `import { CraftRouter } from '@craft-ts/core';
const router = yield* CraftRouter();
craftMethod('nextUser', function* () {
  router.navigate({
    to: 'users/:userId',
    params: { userId: String(Number(userId()) + 1) },
  });
});
`,
  );
  const serviceId = 'service:/demo/users.ts:usersView';
  const componentId = 'component:/demo/users.ts:UsersPage';
  const routeId = 'route:/demo/routes.ts:demo:users/:userId';
  const secondRouteId = 'route:/demo/other.routes.ts:other:users/:userId';
  const nodes: DependencyGraph['nodes'] = [
    {
      id: routeId,
      kind: 'route',
      label: 'demo:users/:userId',
      details: { path: 'users/:userId' },
    },
    {
      id: componentId,
      kind: 'component',
      label: 'UsersPage',
    },
    {
      id: serviceId,
      kind: 'service',
      label: 'usersView',
      filePath: '/demo/users.ts',
      line: 2,
      endLine: 8,
      details: { scope: 'toProvide', unownedAccessCount: 0 },
    },
    {
      id: 'primitive:/demo/users.ts:nextUser',
      kind: 'primitive',
      label: 'craftMethod:nextUser',
      filePath: '/demo/users.ts',
      line: 3,
      endLine: 8,
      details: { primitive: 'craftMethod', ownerId: serviceId },
    },
  ];
  const edges: DependencyGraph['edges'] = [];
  if (options.provideServiceOnComponent !== false) {
    edges.push({
      from: componentId,
      to: serviceId,
      kind: 'provides',
      evidence: 'ast',
    });
    edges.push({
      from: routeId,
      to: componentId,
      kind: 'loads',
      evidence: 'ast',
    });
  }
  if (options.secondOwnerRoute) {
    nodes.push({
      id: secondRouteId,
      kind: 'route',
      label: 'other:users/:userId',
      details: { path: 'users/:userId' },
    });
    edges.push({
      from: secondRouteId,
      to: componentId,
      kind: 'loads',
      evidence: 'ast',
    });
  }
  return {
    project,
    graph: {
      version: 1,
      rootDir: '/demo',
      tsConfigFilePath: '/demo/tsconfig.json',
      nodes,
      edges,
    },
  };
}

function collect(graph: DependencyGraph, project: Project) {
  const sourceFile = project.getSourceFileOrThrow('/demo/users.ts');
  return collectRouteNavigations.collect({
    project,
    rootDir: graph.rootDir,
    sourceFiles: [sourceFile],
    graph,
  }).nodes ?? [];
}
