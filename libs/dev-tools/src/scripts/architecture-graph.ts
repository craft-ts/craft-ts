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

export type ArchitectureNodeView = {
  id: string;
  kind: DependencyGraphNodeKind;
  label: string;
  filePath?: string;
  line?: number;
  details?: Record<string, unknown>;
  provider(name: string): ArchitectureNodeView;
  providers(): ArchitectureNodeView[];
  outgoing(kind?: DependencyGraphEdgeKind): DependencyGraphEdge[];
  incoming(kind?: DependencyGraphEdgeKind): DependencyGraphEdge[];
  httpEndpoints(): { method: string; url: string }[];
};

export type ArchitectureServiceFilter = {
  browserBoundary?: boolean;
  scope?: string;
};

export type ArchitectureGraphView = {
  graph: DependencyGraph;
  catalog: ArchitectureCatalog;
  route(path: string, file?: string): ArchitectureNodeView;
  service(name: string, file?: string): ArchitectureNodeView;
  component(name: string, file?: string): ArchitectureNodeView;
  craftMethod(name: string, file?: string): ArchitectureNodeView;
  httpEndpoint(method: string, url: string): ArchitectureNodeView;
  providedOn(name: string): ArchitectureNodeView[];
  services(filter?: ArchitectureServiceFilter): ArchitectureNodeView[];
  usingHttp(): ArchitectureNodeView[];
  usingTemporal(): ArchitectureNodeView[];
  dependingOnBrowserBoundary(): ArchitectureNodeView[];
  craftMethods(): ArchitectureNodeView[];
  primitives(primitive?: string): ArchitectureNodeView[];
  sources(): ArchitectureNodeView[];
  httpEndpoints(): ArchitectureNodeView[];
};

export type ExclusiveLinkViolation = {
  from: string;
  to: string;
  kind: DependencyGraphEdgeKind;
};

const graphByNode = new WeakMap<ArchitectureNodeView, DependencyGraph>();

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

export function createArchitectureGraph(
  graph: DependencyGraph,
): ArchitectureGraphView {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  const wrap = (node: DependencyGraphNode): ArchitectureNodeView => {
    const view: ArchitectureNodeView = {
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
    catalog: buildArchitectureCatalog(graph),
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
  };
}

export function exclusiveLinkViolations(
  left: ArchitectureNodeView,
  right: ArchitectureNodeView,
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
  left: ArchitectureNodeView,
  right: ArchitectureNodeView,
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

function graphOf(node: ArchitectureNodeView): DependencyGraph {
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

function uniqueNode(
  matches: ArchitectureNodeView[],
  kind: string,
  name: string,
  file?: string,
): ArchitectureNodeView {
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
