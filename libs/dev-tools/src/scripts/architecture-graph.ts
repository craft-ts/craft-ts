import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import type {
  DependencyGraph,
  DependencyGraphEdge,
  DependencyGraphEdgeKind,
  DependencyGraphNode,
  DependencyGraphNodeKind,
} from './dependency-graph.js';

export type ArchitectureProvidedOn = {
  kind: DependencyGraphNodeKind;
  name: string;
  file?: string;
};

export type ArchitectureCatalog = {
  version: 1;
  graphHash: string;
  routes: readonly string[];
  services: readonly string[];
  components: readonly string[];
  primitives: readonly string[];
  sources: readonly string[];
  httpEndpoints: readonly { method: string; url: string }[];
  uniques: readonly string[];
  providers: readonly string[];
  routeProviders: Readonly<Record<string, readonly string[]>>;
  componentProviders: Readonly<Record<string, readonly string[]>>;
  providedOn: Readonly<Record<string, readonly ArchitectureProvidedOn[]>>;
  collisions: {
    services: Readonly<Record<string, readonly string[]>>;
    components: Readonly<Record<string, readonly string[]>>;
    routes: Readonly<Record<string, readonly string[]>>;
  };
  browserBoundaryServices: readonly string[];
  scopes: Readonly<Record<string, string>>;
};

export type ArchitectureNodeView<
  C extends ArchitectureCatalog = ArchitectureCatalog,
> = {
  id: string;
  kind: DependencyGraphNodeKind;
  label: string;
  filePath?: string;
  line?: number;
  details?: Record<string, unknown>;
  provider(name: CatalogProviders<C>): ArchitectureNodeView<C>;
  providers(): ArchitectureNodeView<C>[];
  outgoing(kind?: DependencyGraphEdgeKind): DependencyGraphEdge[];
  incoming(kind?: DependencyGraphEdgeKind): DependencyGraphEdge[];
  httpEndpoints(): { method: string; url: string }[];
};

export type ArchitectureServiceFilter = {
  browserBoundary?: boolean;
  scope?: string;
};

export type ArchitectureGraphView<
  C extends ArchitectureCatalog = ArchitectureCatalog,
> = {
  graph: DependencyGraph;
  catalog: C;
  route(path: CatalogRoutes<C>, file?: string): ArchitectureNodeView<C>;
  service(name: CatalogServices<C>, file?: string): ArchitectureNodeView<C>;
  component(name: CatalogComponents<C>, file?: string): ArchitectureNodeView<C>;
  craftMethod(name: string, file?: string): ArchitectureNodeView<C>;
  httpEndpoint(
    method: CatalogHttp<C>['method'],
    url: CatalogHttp<C>['url'],
  ): ArchitectureNodeView<C>;
  providedOn(name: CatalogProviders<C>): ArchitectureNodeView<C>[];
  services(filter?: ArchitectureServiceFilter): ArchitectureNodeView<C>[];
  usingHttp(): ArchitectureNodeView<C>[];
  usingTemporal(): ArchitectureNodeView<C>[];
  dependingOnBrowserBoundary(): ArchitectureNodeView<C>[];
  craftMethods(): ArchitectureNodeView<C>[];
  primitives(primitive?: string): ArchitectureNodeView<C>[];
  sources(): ArchitectureNodeView<C>[];
  httpEndpoints(): ArchitectureNodeView<C>[];
  unique(value: CatalogUniques<C>): ArchitectureNodeView<C>;
  uniques(): ArchitectureNodeView<C>[];
};

export type ExclusiveLinkViolation = {
  from: string;
  to: string;
  kind: DependencyGraphEdgeKind;
};

type CatalogRoutes<C extends ArchitectureCatalog> = C['routes'][number];
type CatalogServices<C extends ArchitectureCatalog> = C['services'][number];
type CatalogComponents<C extends ArchitectureCatalog> = C['components'][number];
type CatalogProviders<C extends ArchitectureCatalog> = C['providers'][number];
type CatalogHttp<C extends ArchitectureCatalog> = C['httpEndpoints'][number];
type CatalogUniques<C extends ArchitectureCatalog> = C['uniques'][number];

const graphByNode = new WeakMap<
  ArchitectureNodeView<ArchitectureCatalog>,
  DependencyGraph
>();

export function graphHash(graph: DependencyGraph): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        nodes: graph.nodes.map((node) => node.id),
        edges: graph.edges.map((edge) => `${edge.from}:${edge.kind}:${edge.to}`),
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

export function relativeGraphPath(
  graph: DependencyGraph,
  filePath: string | undefined,
): string | undefined {
  if (!filePath) return undefined;
  return relative(graph.rootDir, filePath).split('\\').join('/');
}

export function buildArchitectureCatalog(
  graph: DependencyGraph,
): ArchitectureCatalog {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const collisionsFor = (
    kind: DependencyGraphNodeKind,
    names: readonly string[],
  ) => {
    const collisions: Record<string, string[]> = {};
    for (const name of names) {
      const matches = graph.nodes.filter((node) =>
        nodeMatches(graph, node, kind, name),
      );
      if (matches.length > 1) {
        collisions[name] = matches
          .map((node) => relativeGraphPath(graph, node.filePath) ?? node.id)
          .sort();
      }
    }
    return collisions;
  };

  const routes = uniqueSorted(
    graph.nodes.filter((node) => node.kind === 'route').map(routePath),
  );
  const services = uniqueSorted(
    graph.nodes.filter((node) => node.kind === 'service').map((node) => node.label),
  );
  const components = uniqueSorted(
    graph.nodes
      .filter((node) => node.kind === 'component')
      .map((node) => node.label),
  );
  const primitives = uniqueSorted(
    graph.nodes
      .filter((node) => node.kind === 'primitive')
      .map((node) => String(node.details?.['name'] ?? node.label)),
  );
  const sources = uniqueSorted(
    graph.nodes.filter((node) => node.kind === 'source').map((node) => node.label),
  );
  const httpEndpoints = graph.nodes
    .filter((node) => node.kind === 'http-endpoint')
    .map((node) => ({
      method: String(node.details?.['method'] ?? ''),
      url: String(node.details?.['url'] ?? ''),
    }))
    .sort((left, right) =>
      `${left.method}:${left.url}`.localeCompare(`${right.method}:${right.url}`),
    );
  const uniques = uniqueSorted(
    graph.nodes
      .filter((node) => node.kind === 'unique')
      .map((node) => String(node.details?.['canonical'] ?? node.label)),
  );
  const providedNames = uniqueSorted(
    graph.edges
      .filter((edge) => edge.kind === 'provides')
      .map((edge) => nodesById.get(edge.to)?.label)
      .filter((label): label is string => Boolean(label)),
  );

  const routeProviders: Record<string, string[]> = {};
  const componentProviders: Record<string, string[]> = {};
  const providedOn: Record<string, ArchitectureProvidedOn[]> = {};
  const scopes: Record<string, string> = {};
  const browserBoundaryServices: string[] = [];

  for (const node of graph.nodes) {
    if (node.kind === 'service') {
      const scope = node.details?.['scope'];
      if (typeof scope === 'string') scopes[node.label] = scope;
      if (node.details?.['browserBoundary'] === true) {
        browserBoundaryServices.push(node.label);
      }
    }
    const provided = providedLabels(graph, nodesById, node.id);
    if (provided.length === 0) continue;
    if (node.kind === 'route') routeProviders[routePath(node)] = uniqueSorted(provided);
    if (node.kind === 'component') {
      componentProviders[node.label] = uniqueSorted(provided);
    }
    for (const name of provided) {
      const entries = providedOn[name] ?? [];
      entries.push({
        kind: node.kind,
        name: node.kind === 'route' ? routePath(node) : node.label,
        file: relativeGraphPath(graph, node.filePath),
      });
      providedOn[name] = entries;
    }
  }

  return {
    version: 1,
    graphHash: graphHash(graph),
    routes,
    services,
    components,
    primitives,
    sources,
    httpEndpoints,
    uniques,
    providers: providedNames,
    routeProviders,
    componentProviders,
    providedOn,
    collisions: {
      services: collisionsFor('service', services),
      components: collisionsFor('component', components),
      routes: collisionsFor('route', routes),
    },
    browserBoundaryServices: uniqueSorted(browserBoundaryServices),
    scopes,
  };
}

export function architectureCatalogToTypeScript(
  catalog: ArchitectureCatalog,
): string {
  return `export const architectureCatalog = ${JSON.stringify(catalog, null, 2)} as const;\nexport type ArchitectureCatalog = typeof architectureCatalog;\n`;
}

export function createArchitectureGraph<
  C extends ArchitectureCatalog = ArchitectureCatalog,
>(graph: DependencyGraph, catalog?: C): ArchitectureGraphView<C> {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  const wrap = (node: DependencyGraphNode): ArchitectureNodeView<C> => {
    const view: ArchitectureNodeView<C> = {
      id: node.id,
      kind: node.kind,
      label: node.label,
      filePath: node.filePath,
      line: node.line,
      details: node.details,
      provider(name: string) {
        return uniqueNode(
          view.providers().filter((provider) => provider.label === name),
          'provider',
          name,
        );
      },
      providers() {
        return outgoingOf(graph, node.id, 'provides')
          .map((edge) => nodesById.get(edge.to))
          .filter((target): target is DependencyGraphNode => Boolean(target))
          .map(wrap);
      },
      outgoing(kind?: DependencyGraphEdgeKind) {
        return outgoingOf(graph, node.id, kind);
      },
      incoming(kind?: DependencyGraphEdgeKind) {
        return graph.edges.filter(
          (edge) =>
            edge.to === node.id && (kind === undefined || edge.kind === kind),
        );
      },
      httpEndpoints() {
        if (node.kind === 'http-endpoint') {
          return [
            {
              method: String(node.details?.['method'] ?? ''),
              url: String(node.details?.['url'] ?? ''),
            },
          ];
        }
        return outgoingOf(graph, node.id, 'calls')
          .map((edge) => nodesById.get(edge.to))
          .filter(
            (target): target is DependencyGraphNode =>
              target?.kind === 'http-endpoint',
          )
          .map((target) => ({
            method: String(target.details?.['method'] ?? ''),
            url: String(target.details?.['url'] ?? ''),
          }));
      },
    };
    graphByNode.set(view, graph);
    return view;
  };

  function lookup(
    kind: DependencyGraphNodeKind,
    name: string,
    file?: string,
    predicate?: (node: DependencyGraphNode) => boolean,
  ): ArchitectureNodeView {
    const matches = graph.nodes.filter((node) => {
      if (node.kind !== kind) return false;
      if (predicate && !predicate(node)) return false;
      if (!nodeMatches(graph, node, kind, name)) return false;
      return fileMatches(graph, node, file);
    });
    return uniqueNode(matches.map(wrap), kind, name, file);
  }

  return {
    graph,
    catalog: (catalog ?? buildArchitectureCatalog(graph)) as C,
    route(path, file) {
      return lookup('route', path, file);
    },
    service(name, file) {
      return lookup('service', name, file);
    },
    component(name, file) {
      return lookup('component', name, file);
    },
    craftMethod(name, file) {
      return lookup(
        'primitive',
        name,
        file,
        (node) => node.details?.['primitive'] === 'craftMethod',
      );
    },
    httpEndpoint(method, url) {
      const matches = graph.nodes.filter(
        (node) =>
          node.kind === 'http-endpoint' &&
          node.details?.['method'] === method &&
          node.details?.['url'] === url,
      );
      return uniqueNode(matches.map(wrap), 'http-endpoint', `${method} ${url}`);
    },
    providedOn(name) {
      return graph.edges
        .filter((edge) => {
          if (edge.kind !== 'provides') return false;
          return nodesById.get(edge.to)?.label === name;
        })
        .map((edge) => nodesById.get(edge.from))
        .filter((node): node is DependencyGraphNode => Boolean(node))
        .map(wrap);
    },
    services(filter) {
      return graph.nodes
        .filter((node) => node.kind === 'service')
        .filter((node) => {
          if (
            filter?.browserBoundary !== undefined &&
            node.details?.['browserBoundary'] !== filter.browserBoundary
          ) {
            return false;
          }
          if (
            filter?.scope !== undefined &&
            node.details?.['scope'] !== filter.scope
          ) {
            return false;
          }
          return true;
        })
        .map(wrap);
    },
    usingHttp() {
      return graph.nodes
        .filter(
          (node) =>
            node.details?.['craftHttpClient'] === true ||
            outgoingOf(graph, node.id, 'calls').some(
              (edge) => nodesById.get(edge.to)?.kind === 'http-endpoint',
            ),
        )
        .map(wrap);
    },
    usingTemporal() {
      return graph.nodes
        .filter((node) => node.details?.['temporal'] === true)
        .map(wrap);
    },
    dependingOnBrowserBoundary() {
      const boundaryIds = new Set(
        graph.nodes
          .filter(
            (node) =>
              node.kind === 'service' &&
              node.details?.['browserBoundary'] === true,
          )
          .map((node) => node.id),
      );
      return graph.nodes
        .filter((node) =>
          outgoingOf(graph, node.id, 'depends-on').some((edge) =>
            boundaryIds.has(edge.to),
          ),
        )
        .map(wrap);
    },
    craftMethods() {
      return graph.nodes
        .filter(
          (node) =>
            node.kind === 'primitive' &&
            node.details?.['primitive'] === 'craftMethod',
        )
        .map(wrap);
    },
    primitives(primitive) {
      return graph.nodes
        .filter((node) => {
          if (node.kind !== 'primitive') return false;
          if (primitive === undefined) return true;
          return node.details?.['primitive'] === primitive;
        })
        .map(wrap);
    },
    sources() {
      return graph.nodes.filter((node) => node.kind === 'source').map(wrap);
    },
    httpEndpoints() {
      return graph.nodes
        .filter((node) => node.kind === 'http-endpoint')
        .map(wrap);
    },
    unique(value) {
      return lookup(
        'unique',
        value,
        undefined,
        (node) =>
          node.label === value || node.details?.['canonical'] === value,
      );
    },
    uniques() {
      return graph.nodes.filter((node) => node.kind === 'unique').map(wrap);
    },
  };
}

export function exclusiveLinkViolations(
  left: ArchitectureNodeView<ArchitectureCatalog>,
  right: ArchitectureNodeView<ArchitectureCatalog>,
): ExclusiveLinkViolation[] {
  const graph = graphOf(left);
  const ownership = assignBranchOwnership(graph, [left.id, right.id]);
  const exclusiveLeft = exclusiveIds(ownership, left.id);
  const exclusiveRight = exclusiveIds(ownership, right.id);
  const violations: ExclusiveLinkViolation[] = [];
  for (const edge of graph.edges) {
    const fromLeft = exclusiveLeft.has(edge.from) && exclusiveRight.has(edge.to);
    const fromRight =
      exclusiveRight.has(edge.from) && exclusiveLeft.has(edge.to);
    if (fromLeft || fromRight) {
      violations.push({ from: edge.from, to: edge.to, kind: edge.kind });
    }
  }
  return violations;
}

export function noExclusiveLink(
  left: ArchitectureNodeView<ArchitectureCatalog>,
  right: ArchitectureNodeView<ArchitectureCatalog>,
): void {
  const violations = exclusiveLinkViolations(left, right);
  if (violations.length === 0) return;
  const graph = graphOf(left);
  const labels = (id: string) =>
    graph.nodes.find((node) => node.id === id)?.label ?? id;
  throw new Error(
    `Exclusive architecture link between ${left.label} and ${right.label}: ${violations
      .map(
        (violation) =>
          `${labels(violation.from)} -[${violation.kind}]-> ${labels(violation.to)}`,
      )
      .join(', ')}`,
  );
}

export type CraftUniqueViolation = {
  kind: 'duplicate' | 'non-static';
  id: string;
  label: string;
  callSites: readonly { filePath?: string; line?: number; ownerId?: string }[];
};

export function craftUniqueViolations(
  graph: DependencyGraph,
): CraftUniqueViolation[] {
  return graph.nodes
    .filter((node) => node.kind === 'unique')
    .flatMap((node): CraftUniqueViolation[] => {
      const callSites = Array.isArray(node.details?.['callSites'])
        ? (node.details['callSites'] as CraftUniqueViolation['callSites'])
        : [];
      if (node.details?.['static'] === false) {
        return [
          {
            kind: 'non-static' as const,
            id: node.id,
            label: node.label,
            callSites,
          },
        ];
      }
      if (callSites.length > 1) {
        return [
          {
            kind: 'duplicate' as const,
            id: node.id,
            label: node.label,
            callSites,
          },
        ];
      }
      return [];
    });
}

export function assertCraftUnique(graph: DependencyGraph): void {
  const violations = craftUniqueViolations(graph);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((violation) => {
        const sites = violation.callSites
          .map((site) =>
            [site.filePath, site.line].filter(Boolean).join(':'),
          )
          .filter(Boolean)
          .join(', ');
        if (violation.kind === 'non-static') {
          return `Non-static craftUnique argument cannot be verified${sites ? ` (${sites})` : ''}.`;
        }
        return `Duplicate craftUnique ${violation.label} used twice${sites ? ` (${sites})` : ''}.`;
      })
      .join('\n'),
  );
}

export type RouteDiProofViolationKind =
  | 'missing-di-proof'
  | 'unarmed-mapper'
  | 'missing-pending-proof'
  | 'missing-error-proof'
  | 'missing-exception-assert'
  | 'missing-global-error-proof'
  | 'missing-route-load-error-proof';

export type RouteDiProofViolation = {
  kind: RouteDiProofViolationKind;
  label: string;
  filePath?: string;
  line?: number;
};

export function routeDiProofViolations(
  graph: DependencyGraph,
): RouteDiProofViolation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingChecks = new Map<string, DependencyGraphEdge[]>();
  const incomingContains = new Map<string, DependencyGraphEdge[]>();
  for (const edge of graph.edges) {
    if (edge.kind === 'checks') {
      const list = incomingChecks.get(edge.to) ?? [];
      list.push(edge);
      incomingChecks.set(edge.to, list);
    }
    if (edge.kind === 'contains') {
      const list = incomingContains.get(edge.to) ?? [];
      list.push(edge);
      incomingContains.set(edge.to, list);
    }
  }

  const isArmedMapper = (mapperId: string): boolean => {
    return (incomingContains.get(mapperId) ?? []).some(
      (edge) => nodesById.get(edge.from)?.details?.['mechanism'] === 'CanRun',
    );
  };

  const location = (node: DependencyGraphNode) => ({
    filePath: relativeGraphPath(graph, node.filePath),
    line: node.line,
  });

  const violations: RouteDiProofViolation[] = [];
  for (const node of graph.nodes) {
    if (node.kind !== 'route') continue;
    const checks = incomingChecks.get(node.id) ?? [];
    const diChecks = checks.filter((edge) => {
      const mechanism = nodesById.get(edge.from)?.details?.['mechanism'];
      return (
        mechanism === 'ValidateCascadeRoutesFile' ||
        mechanism === 'RouteCheckedDI' ||
        mechanism === 'RouteExceptionComponentCheckedDI'
      );
    });
    const componentChecks = diChecks.filter(
      (edge) => edge.details?.['target'] !== 'pending' && edge.details?.['target'] !== 'error',
    );
    if (node.details?.['hasComponent']) {
      if (componentChecks.length === 0) {
        violations.push({
          kind: 'missing-di-proof',
          label: String(node.details['path'] ?? node.label),
          ...location(node),
        });
      } else if (!componentChecks.some((edge) => isArmedMapper(edge.from))) {
        violations.push({
          kind: 'unarmed-mapper',
          label: String(node.details['path'] ?? node.label),
          ...location(node),
        });
      }
    }
    if (node.details?.['hasPendingComponent']) {
      const pendingChecks = diChecks.filter(
        (edge) => edge.details?.['target'] === 'pending',
      );
      if (
        pendingChecks.length === 0 ||
        !pendingChecks.some((edge) => isArmedMapper(edge.from))
      ) {
        violations.push({
          kind: 'missing-pending-proof',
          label: String(node.details['path'] ?? node.label),
          ...location(node),
        });
      }
    }
    if (node.details?.['hasErrorComponent']) {
      const errorChecks = diChecks.filter(
        (edge) => edge.details?.['target'] === 'error',
      );
      if (
        errorChecks.length === 0 ||
        !errorChecks.some((edge) => isArmedMapper(edge.from))
      ) {
        violations.push({
          kind: 'missing-error-proof',
          label: String(node.details['path'] ?? node.label),
          ...location(node),
        });
      }
    }
  }

  const collections = new Map<string, DependencyGraphNode[]>();
  for (const node of graph.nodes) {
    if (node.kind !== 'route') continue;
    const key = `${node.filePath ?? ''}::${String(node.details?.['routesName'] ?? '')}`;
    const list = collections.get(key) ?? [];
    list.push(node);
    collections.set(key, list);
  }
  for (const [, routes] of collections) {
    const representative = routes[0];
    if (!representative) continue;
    const hasAssert = routes.some((route) =>
      (incomingChecks.get(route.id) ?? []).some(
        (edge) =>
          nodesById.get(edge.from)?.details?.['mechanism'] ===
          'assertExhaustiveRouteExceptions',
      ),
    );
    if (!hasAssert) {
      violations.push({
        kind: 'missing-exception-assert',
        label: String(representative.details?.['routesName'] ?? representative.label),
        ...location(representative),
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.kind !== 'app-config') continue;
    const checks = incomingChecks.get(node.id) ?? [];
    const armedTarget = (target: string) =>
      checks.some(
        (edge) =>
          edge.details?.['target'] === target &&
          nodesById.get(edge.from)?.details?.['mechanism'] ===
            'RouteExceptionComponentCheckedDI' &&
          isArmedMapper(edge.from),
      );
    if (node.details?.['hasGlobalError'] && !armedTarget('global-error')) {
      violations.push({
        kind: 'missing-global-error-proof',
        label: String(node.details['globalErrorComponent'] ?? node.label),
        ...location(node),
      });
    }
    if (node.details?.['hasRouteLoadError'] && !armedTarget('route-load-error')) {
      violations.push({
        kind: 'missing-route-load-error-proof',
        label: String(node.details['routeLoadErrorComponent'] ?? node.label),
        ...location(node),
      });
    }
  }

  return violations;
}

export function assertRouteDiProofs(graph: DependencyGraph): void {
  const violations = routeDiProofViolations(graph);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((violation) => {
        const at = [violation.filePath, violation.line]
          .filter(Boolean)
          .join(':');
        const suffix = at ? ` (${at})` : '';
        switch (violation.kind) {
          case 'missing-di-proof':
            return `Route ${JSON.stringify(violation.label)} is missing its DI proof.${suffix}`;
          case 'unarmed-mapper':
            return `Route ${JSON.stringify(violation.label)} has a DI mapper that is not armed with CanRun.${suffix}`;
          case 'missing-pending-proof':
            return `Route ${JSON.stringify(violation.label)} is missing its pending-component DI proof.${suffix}`;
          case 'missing-error-proof':
            return `Route ${JSON.stringify(violation.label)} is missing its error-component DI proof.${suffix}`;
          case 'missing-exception-assert':
            return `Route collection ${violation.label} is missing assertExhaustiveRouteExceptions.${suffix}`;
          case 'missing-global-error-proof':
            return `App config is missing an armed DI proof for its global error component ${violation.label}.${suffix}`;
          case 'missing-route-load-error-proof':
            return `App config is missing an armed DI proof for its route-load error component ${violation.label}.${suffix}`;
        }
      })
      .join('\n'),
  );
}

export type HttpEndpointUniqueViolation = {
  id: string;
  label: string;
  method: string;
  url: string;
  callSites: readonly { ownerId?: string; filePath?: string; line?: number }[];
};

export function httpEndpointUniqueViolations(
  graph: DependencyGraph,
): HttpEndpointUniqueViolation[] {
  return graph.nodes
    .filter((node) => node.kind === 'http-endpoint')
    .flatMap((node): HttpEndpointUniqueViolation[] => {
      const callSites = Array.isArray(node.details?.['callSites'])
        ? (node.details['callSites'] as HttpEndpointUniqueViolation['callSites'])
        : [];
      if (callSites.length <= 1) return [];
      return [
        {
          id: node.id,
          label: node.label,
          method: String(node.details?.['method'] ?? ''),
          url: String(node.details?.['url'] ?? ''),
          callSites,
        },
      ];
    });
}

export function assertHttpEndpointUnique(graph: DependencyGraph): void {
  const violations = httpEndpointUniqueViolations(graph);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((violation) => {
        const sites = violation.callSites
          .map((site) =>
            [site.filePath, site.line].filter(Boolean).join(':'),
          )
          .filter(Boolean)
          .join(', ');
        return `Duplicate HTTP ${violation.label} used twice${sites ? ` (${sites})` : ''}.`;
      })
      .join('\n'),
  );
}

export type CraftComputedPureViolation = {
  kind: 'calls' | 'writes';
  id: string;
  label: string;
  targetId: string;
  targetLabel: string;
  filePath?: string;
  line?: number;
};

export function craftComputedPureViolations(
  graph: DependencyGraph,
): CraftComputedPureViolation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes
    .filter(
      (node) =>
        node.kind === 'primitive' &&
        node.details?.['primitive'] === 'craftComputed',
    )
    .flatMap((node) =>
      graph.edges
        .filter(
          (edge) =>
            edge.from === node.id &&
            (edge.kind === 'calls' || edge.kind === 'writes'),
        )
        .map((edge) => {
          const target = nodesById.get(edge.to);
          const name =
            typeof node.details?.['name'] === 'string'
              ? node.details['name']
              : node.label.replace(/^craftComputed:/, '');
          return {
            kind: edge.kind as 'calls' | 'writes',
            id: node.id,
            label: name,
            targetId: edge.to,
            targetLabel: target?.label ?? edge.to,
            filePath: node.filePath,
            line: node.line,
          };
        }),
    );
}

export function assertCraftComputedPure(graph: DependencyGraph): void {
  const violations = craftComputedPureViolations(graph);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((violation) => {
        const site = [violation.filePath, violation.line]
          .filter(Boolean)
          .join(':');
        const action =
          violation.kind === 'writes' ? 'writes' : 'calls';
        return `craftComputed ${violation.label} ${action} ${violation.targetLabel}${site ? ` (${site})` : ''}.`;
      })
      .join('\n'),
  );
}

export type DependencyCycle = {
  ids: readonly string[];
  labels: readonly string[];
};

export function dependencyCycleViolations(
  graph: DependencyGraph,
): DependencyCycle[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    if (edge.kind !== 'depends-on') continue;
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from)?.push(edge.to);
  }

  const labelOf = (id: string) => nodesById.get(id)?.label ?? id;
  return stronglyConnectedComponents(adjacency).flatMap((component) => {
    const allowed = new Set(component);
    const cyclic =
      component.length > 1 ||
      (adjacency.get(component[0]) ?? []).some((neighbor) =>
        allowed.has(neighbor),
      );
    if (!cyclic) return [];
    const ids = cyclePath(component, adjacency);
    return [
      {
        ids,
        labels: ids.map(labelOf),
      },
    ];
  });
}

export function assertNoDependencyCycles(graph: DependencyGraph): void {
  const violations = dependencyCycleViolations(graph);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((cycle) => `Dependency cycle: ${cycle.labels.join(' -> ')}.`)
      .join('\n'),
  );
}

export type PathBoundaryConstraint = {
  source: string;
  onlyDependOn?: readonly string[];
  forbidTarget?: readonly string[];
};

export type PathBoundaryOptions = {
  edgeKinds?: readonly DependencyGraphEdgeKind[];
  constraints: readonly PathBoundaryConstraint[];
};

export type PathBoundaryViolation = {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  fromPath: string;
  toPath: string;
  edgeKind: DependencyGraphEdgeKind;
  source: string;
  reason: 'allowlist' | 'denylist';
};

export function pathBoundaryViolations(
  graph: DependencyGraph,
  options: PathBoundaryOptions,
): PathBoundaryViolation[] {
  const edgeKinds = new Set(options.edgeKinds ?? ['depends-on']);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const violations: PathBoundaryViolation[] = [];

  for (const edge of graph.edges) {
    if (!edgeKinds.has(edge.kind)) continue;
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) continue;
    const fromPath = relativeGraphPath(graph, from.filePath);
    const toPath = relativeGraphPath(graph, to.filePath);
    if (!fromPath || !toPath) continue;

    for (const constraint of options.constraints) {
      if (
        constraint.onlyDependOn === undefined &&
        constraint.forbidTarget === undefined
      ) {
        continue;
      }
      const captures = matchPathGlob(constraint.source, fromPath);
      if (!captures) continue;

      const allowed = constraint.onlyDependOn;
      const forbidden = constraint.forbidTarget;
      const allowHit =
        allowed === undefined
          ? true
          : allowed.some((pattern) =>
              matchPathGlob(pattern, toPath, captures),
            );
      const forbidHit =
        forbidden !== undefined &&
        forbidden.some((pattern) => matchPathGlob(pattern, toPath, captures));

      if (allowHit && !forbidHit) continue;
      violations.push({
        fromId: from.id,
        toId: to.id,
        fromLabel: from.label,
        toLabel: to.label,
        fromPath,
        toPath,
        edgeKind: edge.kind,
        source: constraint.source,
        reason: forbidHit ? 'denylist' : 'allowlist',
      });
    }
  }

  return violations;
}

export function assertPathBoundaries(
  graph: DependencyGraph,
  options: PathBoundaryOptions,
): void {
  const violations = pathBoundaryViolations(graph, options);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map(
        (violation) =>
          `Path boundary: ${violation.fromLabel} -[${violation.edgeKind}]-> ${violation.toLabel} (${violation.fromPath} → ${violation.toPath}).`,
      )
      .join('\n'),
  );
}

export type MutationReactOnOptions = {
  allow?: readonly string[];
};

export type MutationReactOnViolation = {
  id: string;
  label: string;
  filePath?: string;
  line?: number;
};

export function mutationReactOnViolations(
  graph: DependencyGraph,
  options: MutationReactOnOptions = {},
): MutationReactOnViolation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const allowed = new Set(options.allow ?? []);
  return graph.nodes.flatMap((node) => {
    if (node.kind !== 'primitive' || node.details?.['primitive'] !== 'mutation') {
      return [];
    }
    const name = primitiveDisplayName(node);
    if (allowed.has(name) || allowed.has(node.label)) return [];
    const reacts = graph.edges.some(
      (edge) =>
        edge.from === node.id &&
        edge.kind === 'triggers' &&
        edge.details?.['insertion'] === 'react-on-mutation' &&
        nodesById.get(edge.to)?.details?.['primitive'] === 'query',
    );
    if (reacts) return [];
    return [
      {
        id: node.id,
        label: name,
        filePath: relativeGraphPath(graph, node.filePath),
        line: node.line,
      },
    ];
  });
}

export function assertMutationHasReactOn(
  graph: DependencyGraph,
  options: MutationReactOnOptions = {},
): void {
  const violations = mutationReactOnViolations(graph, options);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((violation) => {
        const at = [violation.filePath, violation.line]
          .filter(Boolean)
          .join(':');
        return `Mutation ${violation.label} has no query reacting to it${at ? ` (${at})` : ''}.`;
      })
      .join('\n'),
  );
}

export type PersistedUniqueViolation = {
  id: string;
  label: string;
  primitive: string;
  filePath?: string;
  line?: number;
};

export function persistedPrimitiveUniqueViolations(
  graph: DependencyGraph,
): PersistedUniqueViolation[] {
  return graph.nodes.flatMap((node) => {
    if (node.kind !== 'primitive' || node.details?.['persisted'] !== true) {
      return [];
    }
    if (node.details['persistedUnique'] === true) return [];
    const primitive =
      typeof node.details['primitive'] === 'string'
        ? node.details['primitive']
        : 'primitive';
    return [
      {
        id: node.id,
        label: primitiveDisplayName(node),
        primitive,
        filePath: relativeGraphPath(graph, node.filePath),
        line: node.line,
      },
    ];
  });
}

export function assertPersistedPrimitiveHasUnique(
  graph: DependencyGraph,
): void {
  const violations = persistedPrimitiveUniqueViolations(graph);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((violation) => {
        const at = [violation.filePath, violation.line]
          .filter(Boolean)
          .join(':');
        return `Persisted ${violation.primitive} ${violation.label} is missing craftUnique${at ? ` (${at})` : ''}.`;
      })
      .join('\n'),
  );
}

export type InsertSelectUniqueViolation = {
  key: string;
  hostId: string;
  hostLabel: string;
  callSites: readonly { filePath?: string; line?: number }[];
};

export function insertSelectUniqueViolations(
  graph: DependencyGraph,
): InsertSelectUniqueViolation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const grouped = new Map<string, DependencyGraphNode[]>();
  for (const node of graph.nodes) {
    if (node.kind !== 'primitive' || node.details?.['primitive'] !== 'insertSelect') {
      continue;
    }
    const parent = graph.edges.find(
      (edge) => edge.kind === 'contains' && edge.to === node.id,
    );
    const hostId = parent?.from ?? node.details?.['ownerId'];
    if (typeof hostId !== 'string') continue;
    const key = primitiveDisplayName(node);
    const groupKey = `${hostId}::${key}`;
    const list = grouped.get(groupKey) ?? [];
    list.push(node);
    grouped.set(groupKey, list);
  }
  return [...grouped.entries()].flatMap(([groupKey, nodes]) => {
    if (nodes.length <= 1) return [];
    const hostId = groupKey.slice(0, groupKey.indexOf('::'));
    const key = groupKey.slice(groupKey.indexOf('::') + 2);
    const host = nodesById.get(hostId);
    return [
      {
        key,
        hostId,
        hostLabel: host ? primitiveDisplayName(host) : hostId,
        callSites: nodes.map((node) => ({
          filePath: relativeGraphPath(graph, node.filePath),
          line: node.line,
        })),
      },
    ];
  });
}

export function assertInsertSelectUnique(graph: DependencyGraph): void {
  const violations = insertSelectUniqueViolations(graph);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((violation) => {
        const sites = violation.callSites
          .map((site) => [site.filePath, site.line].filter(Boolean).join(':'))
          .filter(Boolean)
          .join(', ');
        return `Duplicate insertSelect ${violation.key} on ${violation.hostLabel}${sites ? ` (${sites})` : ''}.`;
      })
      .join('\n'),
  );
}

export type CraftEffectNetworkViolation = {
  kind: 'http' | 'mutation';
  id: string;
  label: string;
  targetId: string;
  targetLabel: string;
  filePath?: string;
  line?: number;
};

export function craftEffectNetworkViolations(
  graph: DependencyGraph,
): CraftEffectNetworkViolation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes.flatMap((node) => {
    if (node.kind !== 'primitive' || node.details?.['primitive'] !== 'craftEffect') {
      return [];
    }
    const violations: CraftEffectNetworkViolation[] = [];
    const location = {
      filePath: relativeGraphPath(graph, node.filePath),
      line: node.line,
    };
    const push = (
      kind: 'http' | 'mutation',
      targetId: string,
      targetLabel: string,
    ) => {
      violations.push({
        kind,
        id: node.id,
        label: primitiveDisplayName(node),
        targetId,
        targetLabel,
        ...location,
      });
    };
    for (const edge of graph.edges) {
      if (edge.from !== node.id) continue;
      if (edge.kind !== 'calls' && edge.kind !== 'depends-on') continue;
      const target = nodesById.get(edge.to);
      if (!target) continue;
      if (target.kind === 'http-endpoint') {
        push('http', target.id, target.label);
        continue;
      }
      if (isMutationTarget(graph, nodesById, target)) {
        push('mutation', target.id, primitiveDisplayName(target));
      }
    }
    if (
      node.details?.['craftHttpClient'] === true &&
      !violations.some((violation) => violation.kind === 'http')
    ) {
      push('http', node.id, 'CraftHttpClient');
    }
    return violations;
  });
}

export function assertCraftEffectNoNetwork(graph: DependencyGraph): void {
  const violations = craftEffectNetworkViolations(graph);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((violation) => {
        const at = [violation.filePath, violation.line]
          .filter(Boolean)
          .join(':');
        const action =
          violation.kind === 'http'
            ? `calls HTTP ${violation.targetLabel}`
            : `calls mutation ${violation.targetLabel}`;
        return `craftEffect ${violation.label} ${action}${at ? ` (${at})` : ''}.`;
      })
      .join('\n'),
  );
}

const IMPERATIVE_SYNC_HOSTS = new Set([
  'state',
  'query',
  'mutation',
  'asyncProcess',
]);
const IMPERATIVE_SYNC_WRITE_MEMBERS = new Set([
  'set',
  'update',
  'patch',
  'emit',
]);

export type CraftEffectImperativeSyncKind =
  | 'state'
  | 'source'
  | 'query'
  | 'mutation'
  | 'asyncProcess';

export type CraftEffectImperativeSyncViolation = {
  kind: CraftEffectImperativeSyncKind;
  action: 'writes' | 'calls';
  id: string;
  label: string;
  targetId: string;
  targetLabel: string;
  filePath?: string;
  line?: number;
};

export function craftEffectImperativeSyncViolations(
  graph: DependencyGraph,
): CraftEffectImperativeSyncViolation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes.flatMap((node) => {
    if (node.kind !== 'primitive' || node.details?.['primitive'] !== 'craftEffect') {
      return [];
    }
    const location = {
      filePath: relativeGraphPath(graph, node.filePath),
      line: node.line,
    };
    const violations: CraftEffectImperativeSyncViolation[] = [];
    for (const edge of graph.edges) {
      if (edge.from !== node.id) continue;
      const target = nodesById.get(edge.to);
      if (!target) continue;
      const host = imperativeSyncHost(graph, nodesById, target);
      if (!host) continue;
      const member = propertyMemberName(target);
      const writes =
        edge.kind === 'writes' ||
        (edge.kind === 'calls' &&
          member !== undefined &&
          IMPERATIVE_SYNC_WRITE_MEMBERS.has(member));
      const calls = edge.kind === 'calls';
      const functionTrigger =
        edge.kind === 'depends-on' &&
        (host.kind === 'mutation' || host.kind === 'asyncProcess') &&
        target.kind === 'primitive';
      if (!writes && !calls && !functionTrigger) continue;
      violations.push({
        kind: host.kind,
        action: writes ? 'writes' : 'calls',
        id: node.id,
        label: primitiveDisplayName(node),
        targetId: target.id,
        targetLabel: host.label,
        ...location,
      });
    }
    return violations;
  });
}

export function assertCraftEffectNoImperativeSync(
  graph: DependencyGraph,
): void {
  const violations = craftEffectImperativeSyncViolations(graph);
  if (violations.length === 0) return;
  throw new Error(
    violations
      .map((violation) => {
        const at = [violation.filePath, violation.line]
          .filter(Boolean)
          .join(':');
        return `craftEffect ${violation.label} ${violation.action} ${violation.kind} ${violation.targetLabel}${at ? ` (${at})` : ''}. Prefer a state sourced from those signals, or reactive query/mutation params.`;
      })
      .join('\n'),
  );
}

function primitiveDisplayName(node: DependencyGraphNode): string {
  if (typeof node.details?.['name'] === 'string') return node.details['name'];
  const separator = node.label.indexOf(':');
  return separator >= 0 ? node.label.slice(separator + 1) : node.label;
}

function propertyMemberName(node: DependencyGraphNode): string | undefined {
  if (typeof node.details?.['member'] === 'string') return node.details['member'];
  if (typeof node.details?.['property'] === 'string') {
    return node.details['property'];
  }
  return undefined;
}

function containingParent(
  graph: DependencyGraph,
  nodesById: Map<string, DependencyGraphNode>,
  target: DependencyGraphNode,
): DependencyGraphNode | undefined {
  const owner = graph.edges.find(
    (edge) => edge.kind === 'contains' && edge.to === target.id,
  );
  return owner ? nodesById.get(owner.from) : undefined;
}

function imperativeSyncHost(
  graph: DependencyGraph,
  nodesById: Map<string, DependencyGraphNode>,
  target: DependencyGraphNode,
): { kind: CraftEffectImperativeSyncKind; label: string } | undefined {
  if (target.kind === 'source') {
    return { kind: 'source', label: target.label };
  }
  if (
    target.kind === 'primitive' &&
    typeof target.details?.['primitive'] === 'string' &&
    IMPERATIVE_SYNC_HOSTS.has(target.details['primitive'])
  ) {
    return {
      kind: target.details['primitive'] as CraftEffectImperativeSyncKind,
      label: primitiveDisplayName(target),
    };
  }
  const parent = containingParent(graph, nodesById, target);
  if (!parent || parent.id === target.id) return undefined;
  return imperativeSyncHost(graph, nodesById, parent);
}

function isMutationTarget(
  graph: DependencyGraph,
  nodesById: Map<string, DependencyGraphNode>,
  target: DependencyGraphNode,
): boolean {
  if (target.kind === 'primitive' && target.details?.['primitive'] === 'mutation') {
    return true;
  }
  if (target.kind !== 'property') return false;
  const owner = graph.edges.find(
    (edge) => edge.kind === 'contains' && edge.to === target.id,
  );
  const parent = owner ? nodesById.get(owner.from) : undefined;
  return parent?.details?.['primitive'] === 'mutation';
}

export function assertDeclarativeArchitecture(graph: DependencyGraph): void {
  const messages: string[] = [];
  for (const assert of [
    assertCraftUnique,
    assertHttpEndpointUnique,
    assertCraftComputedPure,
    assertNoDependencyCycles,
  ]) {
    try {
      assert(graph);
    } catch (error) {
      messages.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (messages.length === 0) return;
  throw new Error(messages.join('\n'));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(
  pattern: string,
  captures: Readonly<Record<string, string>> = {},
): RegExp {
  let source = '^';
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith('**/', i)) {
      source += '(?:.*/)?';
      i += 3;
      continue;
    }
    if (pattern.startsWith('**', i)) {
      source += '.*';
      i += 2;
      continue;
    }
    if (pattern[i] === '*') {
      source += '[^/]*';
      i += 1;
      continue;
    }
    if (pattern[i] === ':') {
      const nameMatch = /^:([A-Za-z_][A-Za-z0-9_]*)/.exec(pattern.slice(i));
      if (!nameMatch) {
        source += ':';
        i += 1;
        continue;
      }
      const name = nameMatch[1] ?? '';
      if (name in captures) {
        source += escapeRegex(captures[name] ?? '');
      } else {
        source += `(?<${name}>[^/]+)`;
      }
      i += nameMatch[0].length;
      continue;
    }
    source += escapeRegex(pattern[i] ?? '');
    i += 1;
  }
  source += '$';
  return new RegExp(source);
}

function matchPathGlob(
  pattern: string,
  path: string,
  captures: Readonly<Record<string, string>> = {},
): Record<string, string> | null {
  const match = globToRegExp(pattern, captures).exec(path);
  if (!match) return null;
  return { ...captures, ...(match.groups ?? {}) };
}

function stronglyConnectedComponents(
  adjacency: Map<string, string[]>,
): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const connect = (id: string): void => {
    indices.set(id, index);
    lowlink.set(id, index);
    index += 1;
    stack.push(id);
    onStack.add(id);

    for (const neighbor of adjacency.get(id) ?? []) {
      if (!indices.has(neighbor)) {
        connect(neighbor);
        lowlink.set(
          id,
          Math.min(lowlink.get(id) ?? 0, lowlink.get(neighbor) ?? 0),
        );
      } else if (onStack.has(neighbor)) {
        lowlink.set(
          id,
          Math.min(lowlink.get(id) ?? 0, indices.get(neighbor) ?? 0),
        );
      }
    }

    if (lowlink.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    let node: string;
    do {
      node = stack.pop() ?? id;
      onStack.delete(node);
      component.push(node);
    } while (node !== id);
    components.push(component);
  };

  for (const id of adjacency.keys()) {
    if (!indices.has(id)) connect(id);
  }
  return components;
}

function cyclePath(
  component: string[],
  adjacency: Map<string, string[]>,
): string[] {
  const allowed = new Set(component);
  if (component.length === 1) {
    const id = component[0];
    return (adjacency.get(id) ?? []).includes(id) ? [id, id] : [id];
  }

  const start = component[0];
  const path: string[] = [];
  const visit = (id: string): boolean => {
    path.push(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!allowed.has(next)) continue;
      if (next === start && path.length > 1) {
        path.push(start);
        return true;
      }
      if (!path.includes(next) && visit(next)) return true;
    }
    path.pop();
    return false;
  };
  return visit(start) ? path : component;
}

function graphOf(
  node: ArchitectureNodeView<ArchitectureCatalog>,
): DependencyGraph {
  const graph = graphByNode.get(node);
  if (!graph) {
    throw new Error('Architecture nodes must come from createArchitectureGraph().');
  }
  return graph;
}

function providedLabels(
  graph: DependencyGraph,
  nodesById: Map<string, DependencyGraphNode>,
  ownerId: string,
): string[] {
  return uniqueSorted(
    graph.edges
      .filter((edge) => edge.kind === 'provides' && edge.from === ownerId)
      .map((edge) => nodesById.get(edge.to)?.label)
      .filter((label): label is string => Boolean(label)),
  );
}

function outgoingOf(
  graph: DependencyGraph,
  id: string,
  kind?: DependencyGraphEdgeKind,
): DependencyGraphEdge[] {
  return graph.edges.filter(
    (edge) => edge.from === id && (kind === undefined || edge.kind === kind),
  );
}

function assignBranchOwnership(
  graph: DependencyGraph,
  rootIds: readonly string[],
): Map<string, string | 'shared'> {
  const provideTargets = new Set(
    graph.edges
      .filter((edge) => edge.kind === 'provides')
      .map((edge) => edge.to),
  );
  const providedByRoot = new Map<string, Set<string>>();
  for (const rootId of rootIds) {
    providedByRoot.set(
      rootId,
      new Set(
        graph.edges
          .filter((edge) => edge.kind === 'provides' && edge.from === rootId)
          .map((edge) => edge.to),
      ),
    );
  }

  const ownership = new Map<string, string | 'shared'>();
  type WaveItem = { id: string; owner: string };
  let wave: WaveItem[] = [];
  for (const rootId of rootIds) {
    ownership.set(rootId, rootId);
    wave.push({ id: rootId, owner: rootId });
    for (const provided of providedByRoot.get(rootId) ?? []) {
      const current = ownership.get(provided);
      if (current === undefined) {
        ownership.set(provided, rootId);
        wave.push({ id: provided, owner: rootId });
      } else if (current !== rootId) {
        ownership.set(provided, 'shared');
      }
    }
  }

  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }

  while (wave.length > 0) {
    const next: WaveItem[] = [];
    const claimedThisWave = new Map<string, string>();
    for (const item of wave) {
      if (ownership.get(item.id) === 'shared') continue;
      for (const neighbor of outgoing.get(item.id) ?? []) {
        if (
          provideTargets.has(neighbor) &&
          !providedByRoot.get(item.owner)?.has(neighbor)
        ) {
          continue;
        }
        const existing = ownership.get(neighbor);
        if (existing === 'shared') continue;
        if (existing !== undefined && existing !== item.owner) {
          if (claimedThisWave.has(neighbor)) {
            ownership.set(neighbor, 'shared');
          }
          continue;
        }
        if (existing === undefined) {
          claimedThisWave.set(neighbor, item.owner);
          ownership.set(neighbor, item.owner);
          next.push({ id: neighbor, owner: item.owner });
        }
      }
    }
    wave = next;
  }

  return ownership;
}

function exclusiveIds(
  ownership: Map<string, string | 'shared'>,
  rootId: string,
): Set<string> {
  return new Set(
    [...ownership.entries()]
      .filter(([, owner]) => owner === rootId)
      .map(([id]) => id),
  );
}

function nodeMatches(
  _graph: DependencyGraph,
  node: DependencyGraphNode,
  kind: DependencyGraphNodeKind,
  name: string,
): boolean {
  if (kind === 'route') return routePath(node) === name;
  if (kind === 'unique') {
    return (
      node.label === name || node.details?.['canonical'] === name
    );
  }
  if (kind === 'primitive') {
    return (
      node.details?.['name'] === name ||
      node.label === name ||
      node.label === `craftMethod:${name}` ||
      node.label.endsWith(`:${name}`)
    );
  }
  return node.label === name;
}

function fileMatches(
  graph: DependencyGraph,
  node: DependencyGraphNode,
  file?: string,
): boolean {
  if (!file) return true;
  const relativePath = relativeGraphPath(graph, node.filePath);
  if (!relativePath) return false;
  return relativePath === file || relativePath.endsWith(file);
}

function routePath(node: DependencyGraphNode): string {
  const path = node.details?.['path'];
  return typeof path === 'string' ? path : node.label;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function uniqueNode<C extends ArchitectureCatalog>(
  matches: ArchitectureNodeView<C>[],
  kind: string,
  name: string,
  file?: string,
): ArchitectureNodeView<C> {
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(
      file
        ? `Unknown ${kind} '${name}' in '${file}'.`
        : `Unknown ${kind} '${name}'.`,
    );
  }
  const files = matches
    .map((node) => node.filePath ?? node.id)
    .sort()
    .join(', ');
  throw new Error(
    `Ambiguous ${kind} '${name}'. Disambiguate with file: ${files}`,
  );
}
