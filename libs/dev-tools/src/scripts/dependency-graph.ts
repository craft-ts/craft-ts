import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  CallExpression,
  FunctionDeclaration,
  Node,
  ObjectLiteralExpression,
  Project,
  PropertyAccessExpression,
  SourceFile,
  SyntaxKind,
  VariableDeclaration,
} from 'ts-morph';
import {
  architectureCatalogToTypeScript,
  buildArchitectureCatalog,
} from './architecture-graph.js';

import {
  collectEffectLayers,
  collectEffectOperationOwners,
  collectEffectServices,
  collectEffectServiceUsage,
} from './effect-dependency-graph.js';
import { collectDataFlowGraph } from './data-flow-graph.js';

/**
 * The graph's built-in vocabulary.  Values are deliberately detail records
 * rather than node classes: consumers can augment this interface with module
 * augmentation without making the graph core import their runtime.
 */
export interface DependencyGraphNodeRegistry {
  route: Record<string, unknown>;
  'route-hook': Record<string, unknown>;
  'route-check': Record<string, unknown>;
  'app-config': Record<string, unknown>;
  component: Record<string, unknown>;
  service: Record<string, unknown>;
  property: Record<string, unknown>;
  primitive: Record<string, unknown>;
  source: Record<string, unknown>;
  'http-endpoint': Record<string, unknown>;
  unique: Record<string, unknown>;
  'template-element': Record<string, unknown>;
  'server-function-family': Record<string, unknown>;
  'server-function-contract': Record<string, unknown>;
  'server-function-client': Record<string, unknown>;
  'server-function-server': Record<string, unknown>;
  'server-function-misnamed': Record<string, unknown>;
  'server-function-middleware': Record<string, unknown>;
  'server-function-middleware-misnamed': Record<string, unknown>;
  'client-function-middleware': Record<string, unknown>;
  'client-function-middleware-misnamed': Record<string, unknown>;
  handshake: Record<string, unknown>;
}

export type DependencyGraphNodeKind = keyof DependencyGraphNodeRegistry;

export type DependencyGraphNodeFor<
  K extends DependencyGraphNodeKind = DependencyGraphNodeKind,
> = {
  id: string;
  kind: K;
  label: string;
  filePath?: string;
  line?: number;
  details?: DependencyGraphNodeRegistry[K];
};

/**
 * The built-in relation vocabulary.  Relation details are open for the same
 * reason as node details: an adapter can add a typed relation without
 * changing this module.
 */
export interface DependencyGraphEdgeRegistry {
  loads: Record<string, unknown>;
  renders: Record<string, unknown>;
  contains: Record<string, unknown>;
  checks: Record<string, unknown>;
  'depends-on': Record<string, unknown>;
  provides: Record<string, unknown>;
  'uses-property': Record<string, unknown>;
  calls: Record<string, unknown>;
  reads: Record<string, unknown>;
  writes: Record<string, unknown>;
  subscribes: Record<string, unknown>;
  triggers: Record<string, unknown>;
}

export type DependencyGraphEdgeKind = keyof DependencyGraphEdgeRegistry;

export type DependencyGraphEdgeFor<
  K extends DependencyGraphEdgeKind = DependencyGraphEdgeKind,
> = {
  from: string;
  to: string;
  kind: K;
  evidence: 'ast' | 'type';
  details?: DependencyGraphEdgeRegistry[K];
  proof?: DependencyGraphProof;
};

export type DependencyGraphProof = {
  filePath: string;
  line?: number;
  symbol?: string;
  pattern?: string;
};

export type DependencyGraphDiagnostic = {
  code: string;
  message: string;
  proof?: DependencyGraphProof;
};

export type RouteCheckMechanism =
  | 'ValidateCascadeRoutesFile'
  | 'RouteCheckedDI'
  | 'RouteExceptionComponentCheckedDI'
  | 'CanRun'
  | 'assertExhaustiveRouteExceptions';

export type DependencyGraphNode = {
  id: string;
  kind: DependencyGraphNodeKind;
  label: string;
  filePath?: string;
  line?: number;
  details?: Record<string, unknown>;
};

export type DependencyGraphHttpEndpoint = {
  method: string;
  url: string;
  line: number;
};

export type DependencyGraphTemporalOperation = {
  operation: string;
  delay?: string;
  line: number;
};

export type DependencyGraphEdge = {
  from: string;
  to: string;
  kind: DependencyGraphEdgeKind;
  evidence: 'ast' | 'type';
  details?: Record<string, unknown>;
  proof?: DependencyGraphProof;
};

export type DependencyGraph = {
  version: 1;
  rootDir: string;
  tsConfigFilePath: string;
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  diagnostics?: DependencyGraphDiagnostic[];
};

export type AnalyzeDependencyGraphOptions = {
  rootDir?: string;
  tsConfigFilePath?: string;
  include?: readonly string[];
  /** Additional collectors are opt-in; importing their types has no effect. */
  collectors?: readonly DependencyGraphCollector[];
  /** Repository-declared middleware capabilities used by security rules. */
  middlewareCapabilities?: Readonly<Record<string, readonly string[]>>;
};

export type DependencyGraphCollectorContext = {
  readonly project: Project;
  readonly rootDir: string;
  readonly sourceFiles: readonly SourceFile[];
  readonly graph: Readonly<DependencyGraph>;
};

export type DependencyGraphContribution = {
  readonly nodes?: readonly DependencyGraphNode[];
  readonly edges?: readonly DependencyGraphEdge[];
  readonly diagnostics?: readonly DependencyGraphDiagnostic[];
};

export type DependencyGraphCollector = {
  readonly name: string;
  readonly collect: (
    context: DependencyGraphCollectorContext,
  ) => DependencyGraphContribution;
};

export type WriteDependencyGraphOptions = AnalyzeDependencyGraphOptions & {
  outputPath: string;
  format?: 'json' | 'mermaid' | 'html' | 'both' | 'all';
};

const PRIMITIVES = new Set([
  'state',
  'query',
  'mutation',
  'queryEffect',
  'computedEffect',
  'mutationEffect',
  'asyncProcessEffect',
  'asyncProcess',
  'queryParams',
  'insertSelect',
  'craftStateMachine',
  'craftComputed',
  'craftEffect',
  'craftMethod',
]);
// A host owns the primitives declared inside it: they hang off the host in the
// graph instead of flattening into the component or service around it.
const HOST_PRIMITIVES = new Set([
  'state',
  'query',
  'mutation',
  'queryEffect',
  'computedEffect',
  'mutationEffect',
  'asyncProcessEffect',
  'asyncProcess',
  'queryParams',
  'insertSelect',
  'craftStateMachine',
]);
const STORAGE_PERSISTER_INSERTIONS = new Set([
  'insertStoragePersister',
  'insertLocalStoragePersister',
]);
const INSERTION_PIPES = new Set([
  'insertAsyncProcessPipe',
  'insertMutationPipe',
  'insertQueryParamsPipe',
  'insertQueryPipe',
  'insertStatePipe',
]);
const INSERTION_CONTEXT_KEYS = new Set([
  'insertions',
  'patch',
  'resource',
  'set',
  'state',
  'update',
]);

const SOURCE_CREATORS = new Set(['source$', 'signalSource']);
const CRAFT_HTTP_CLIENT_METHODS = new Set([
  'get',
  'delete',
  'post',
  'put',
  'patch',
  'request',
]);
const CRAFT_TEMPORAL_FUNCTIONS = new Set([
  'craftSleep',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]);
const CRAFT_TEMPORAL_RUNTIME_METHODS = new Set(['sleep', 'schedule', 'cancel']);
const NON_DEPENDENCY_PROPERTY_NAMES = new Set([
  'map',
  'filter',
  'find',
  'findIndex',
  'slice',
  'join',
  'includes',
  'indexOf',
  'push',
  'pop',
  'shift',
  'unshift',
]);
const REACTIVE_READER_NAMES = new Set([
  'state',
  'resource',
  'value',
  'isLoading',
  'hasValue',
  'hasException',
  'exceptions',
  'settledValue',
  'status',
  'currentPageStatus',
  'currentTerm',
]);
const REACTIVE_METHOD_NAMES = new Set([
  'mutate',
  'set',
  'update',
  'patch',
  'increment',
  'decrement',
  'emit',
  'reset',
  'clear',
  'reload',
]);
const REACTIVE_WRAPPER_NAMES = new Set(['settled', 'craftUse']);
const INSERTION_CONTEXT_NAMES = new Set([
  'state',
  'resource',
  'set',
  'update',
  'patch',
  'hasException',
  'hasValue',
  'exceptions',
  'value',
]);

type ReactiveBinding = {
  primitiveId: string;
  service?: ServiceInfo;
};

type ServiceInfo = {
  node: DependencyGraphNode;
  helpers: Set<string>;
  call: CallExpression;
  outputPropertyNames: Set<string>;
  outputType?: import('ts-morph').Type;
};

type ComponentInfo = {
  node: DependencyGraphNode;
  call: CallExpression;
  bindings: Map<string, ServiceInfo>;
};

type RouteInfo = {
  node: DependencyGraphNode;
  sourceFile: SourceFile;
  object: ObjectLiteralExpression;
  routesName: string;
  collectionName: string;
};

type SourceInfo = {
  node: DependencyGraphNode;
  variableNames: Set<string>;
  call: CallExpression;
};

type CraftHttpClientUsage = DependencyGraphHttpEndpoint;
type CraftTemporalUsage = DependencyGraphTemporalOperation;

type AppConfigInfo = {
  node: DependencyGraphNode;
  sourceFile: SourceFile;
  object: ObjectLiteralExpression;
};

type GraphBuilder = {
  project: Project;
  rootDir: string;
  graph: DependencyGraph;
  nodes: Map<string, DependencyGraphNode>;
  edges: Map<string, DependencyGraphEdge>;
  services: ServiceInfo[];
  components: ComponentInfo[];
  sources: SourceInfo[];
  routeFiles: Map<string, RouteInfo[]>;
  appConfigs: AppConfigInfo[];
  serviceByHelperKey: Map<string, ServiceInfo>;
  servicesByHelperName: Map<string, ServiceInfo[]>;
  componentByVariable: Map<string, ComponentInfo>;
  componentByVariableKey: Map<string, ComponentInfo>;
  componentsByVariableName: Map<string, ComponentInfo[]>;
  diagnostics: DependencyGraphDiagnostic[];
  middlewareCapabilities: Readonly<Record<string, readonly string[]>>;
};

export function analyzeDependencyGraph(
  options: AnalyzeDependencyGraphOptions = {},
): DependencyGraph {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const tsConfigFilePath = resolve(
    rootDir,
    options.tsConfigFilePath ?? detectTsConfig(rootDir),
  );
  const project = new Project({ tsConfigFilePath });
  const builder: GraphBuilder = {
    project,
    rootDir,
    graph: {
      version: 1,
      rootDir,
      tsConfigFilePath,
      nodes: [],
      edges: [],
      diagnostics: [],
    },
    nodes: new Map(),
    edges: new Map(),
    services: [],
    components: [],
    sources: [],
    routeFiles: new Map(),
    appConfigs: [],
    serviceByHelperKey: new Map(),
    servicesByHelperName: new Map(),
    componentByVariable: new Map(),
    componentByVariableKey: new Map(),
    componentsByVariableName: new Map(),
    diagnostics: [],
    middlewareCapabilities: options.middlewareCapabilities ?? {},
  };

  const sourceFiles = project
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile())
    .filter((sourceFile) =>
      options.include?.length
        ? options.include.some((pattern) =>
            sourceFile.getFilePath().includes(pattern),
          )
        : true,
    );

  collectServices(builder, sourceFiles);
  collectSources(builder, sourceFiles);
  collectComponents(builder, sourceFiles);
  collectRoutes(builder, sourceFiles);
  collectAppConfigs(builder, sourceFiles);
  // Server-function nodes must exist before service/component analysis so
  // loader calls can be linked directly to their family node.
  collectServerFunctions(builder, sourceFiles);
  collectServerFunctionMiddlewares(builder, sourceFiles);
  collectClientFunctionMiddlewares(builder, sourceFiles);
  collectHandshakes(builder, sourceFiles);
  analyzeServiceBodies(builder);
  analyzeComponents(builder);
  collectInteractiveTemplateElements(builder);
  analyzeRoutes(builder);
  analyzeInsertions(builder);
  collectCraftUniques(builder, sourceFiles);
  collectRouteChecks(builder);
  collectEffectGraph(builder, sourceFiles);
  linkEffectLoaderRequirements(builder);

  builder.graph.nodes = [...builder.nodes.values()];
  builder.graph.edges = [...builder.edges.values()];
  for (const collector of options.collectors ?? []) {
    const contribution = collector.collect({
      project,
      rootDir,
      sourceFiles,
      graph: builder.graph,
    });
    mergeCollectorContribution(builder, collector.name, contribution);
    builder.graph.nodes = [...builder.nodes.values()];
    builder.graph.edges = [...builder.edges.values()];
  }

  builder.graph.nodes = [...builder.nodes.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  builder.graph.edges = [...builder.edges.values()].sort((left, right) =>
    `${left.from}:${left.kind}:${left.to}`.localeCompare(
      `${right.from}:${right.kind}:${right.to}`,
    ),
  );
  if (builder.diagnostics.length > 0) {
    builder.graph.diagnostics = [...builder.diagnostics];
  }
  return builder.graph;
}

export async function writeDependencyGraph(
  options: WriteDependencyGraphOptions,
): Promise<DependencyGraph> {
  const graph = analyzeDependencyGraph(options);
  const format = options.format ?? 'both';
  const outputPath = resolve(
    options.rootDir ?? process.cwd(),
    options.outputPath,
  );
  await mkdir(dirname(outputPath), { recursive: true });

  if (format === 'json' || format === 'both' || format === 'all') {
    const jsonPath = format === 'json' ? outputPath : `${outputPath}.json`;
    await writeFile(jsonPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
    const catalogPath = `${outputPath.replace(/\.(json|html|mmd)$/i, '')}.architecture.ts`;
    await writeFile(
      catalogPath,
      architectureCatalogToTypeScript(buildArchitectureCatalog(graph)),
      'utf8',
    );
  }
  if (format === 'mermaid' || format === 'both' || format === 'all') {
    const mermaidPath = format === 'mermaid' ? outputPath : `${outputPath}.mmd`;
    await writeFile(
      mermaidPath,
      `${dependencyGraphToMermaid(graph)}\n`,
      'utf8',
    );
  }
  if (format === 'html' || format === 'all') {
    const htmlPath = format === 'html' ? outputPath : `${outputPath}.html`;
    await writeFile(htmlPath, dependencyGraphToHtml(graph), 'utf8');
  }
  return graph;
}

export function dependencyGraphToMermaid(graph: DependencyGraph): string {
  const lines = ['graph TD'];
  const ids = new Map<string, string>();
  const labelCounts = new Map<string, number>();
  for (const node of graph.nodes) {
    const key = `${node.kind}:${node.label}`;
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }
  let nextId = 0;
  const getId = (nodeId: string): string => {
    const existing = ids.get(nodeId);
    if (existing) return existing;
    const id = `n${nextId++}`;
    ids.set(nodeId, id);
    return id;
  };
  for (const node of graph.nodes) {
    const id = getId(node.id);
    const duplicate = (labelCounts.get(`${node.kind}:${node.label}`) ?? 0) > 1;
    const location = node.filePath
      ? relative(graph.rootDir, node.filePath).split('\\').join('/')
      : undefined;
    const displayLabel =
      duplicate && location ? `${node.label} — ${location}` : node.label;
    const label = escapeMermaid(displayLabel);
    if (node.kind === 'route') {
      lines.push(`  ${id}{{"${label}"}}`);
    } else if (node.kind === 'app-config') {
      lines.push(`  ${id}[/"${label}"/]`);
    } else if (node.kind === 'route-check') {
      lines.push(`  ${id}[["${label}"]]`);
    } else if (node.kind === 'service') {
      lines.push(`  ${id}(["${label}"])`);
    } else {
      lines.push(`  ${id}["${label}"]`);
    }
  }
  for (const edge of graph.edges) {
    lines.push(
      `  ${getId(edge.from)} -->|${escapeMermaid(edge.kind)}| ${getId(edge.to)}`,
    );
  }
  return lines.join('\n');
}

/**
 * Creates a self-contained, static explorer. The graph is embedded in the file
 * so opening the HTML never needs the source tree, a server, or application
 * runtime instrumentation.
 */
export function dependencyGraphToHtml(graph: DependencyGraph): string {
  const serializedGraph = JSON.stringify(graph)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CraftTS — Dependency Explorer</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --panel-soft: #f8fafc;
      --line: #dce3ee;
      --text: #172033;
      --muted: #68758a;
      --accent: #315efb;
      --accent-soft: #e8edff;
      --warning: #a15c00;
      --warning-soft: #fff4df;
      --shadow: 0 12px 35px rgba(25, 38, 65, .08);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }
    button, input { font: inherit; }
    button { color: inherit; }
    .app { min-height: 100vh; display: grid; grid-template-columns: 280px minmax(440px, 1fr) 360px; grid-template-rows: auto minmax(0, 1fr); }
    .topbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 22px; padding: 14px 20px; background: var(--panel); border-bottom: 1px solid var(--line); }
    .brand { min-width: 250px; }
    .brand h1 { margin: 0; font-size: 17px; letter-spacing: -.02em; }
    .brand p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
    .search { flex: 1; max-width: 620px; position: relative; }
    .search input { width: 100%; padding: 10px 13px 10px 36px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel-soft); outline: none; }
    .search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .search span { position: absolute; left: 13px; top: 9px; color: var(--muted); }
    .stats { display: flex; gap: 15px; margin-left: auto; color: var(--muted); white-space: nowrap; font-size: 12px; }
    .stats strong { display: block; color: var(--text); font-size: 16px; line-height: 1.1; }
    .sidebar, .details { min-height: 0; overflow: auto; background: var(--panel); }
    .sidebar { border-right: 1px solid var(--line); padding: 18px 14px; }
    .details { border-left: 1px solid var(--line); padding: 20px; }
    .side-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 7px 10px; }
    .side-title h2 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .route-list { display: grid; gap: 5px; }
    .route-button { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; width: 100%; padding: 9px 10px; text-align: left; border: 1px solid transparent; border-radius: 8px; background: transparent; cursor: pointer; }
    .route-button:hover { background: var(--panel-soft); }
    .route-button.active { background: var(--accent-soft); border-color: #cbd5ff; color: #173bb8; }
    .route-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .route-meta { display: flex; gap: 5px; align-items: center; color: var(--muted); font-size: 11px; }
    .badge { display: inline-flex; align-items: center; min-height: 19px; padding: 1px 6px; border-radius: 999px; background: #edf1f7; color: var(--muted); font-size: 11px; white-space: nowrap; }
    .badge.shared { background: var(--warning-soft); color: var(--warning); }
    .workspace { min-width: 0; min-height: 0; overflow: auto; padding: 22px 26px 40px; }
    .workspace-head { display: flex; align-items: start; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
    .workspace-head h2 { margin: 0; font-size: 20px; letter-spacing: -.025em; }
    .workspace-head p { margin: 4px 0 0; color: var(--muted); }
    .filter-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
    .filter { border: 1px solid var(--line); background: var(--panel); border-radius: 999px; padding: 5px 10px; cursor: pointer; color: var(--muted); }
    .filter.active { color: var(--accent); border-color: #b9c5ff; background: var(--accent-soft); }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 16px 2px; color: var(--muted); font-size: 11px; }
    .legend-item { display: inline-flex; align-items: center; gap: 5px; }
    .legend-line { display: inline-block; width: 22px; height: 3px; border-radius: 99px; }
    .legend-line.template { background: #7c4dff; }
    .legend-line.setup { background: #72a9d2; }
    .legend-line.both { background: #ae70c7; }
    .legend-line.calls { background: #e67e22; }
    .legend-line.depends { background: #00a884; }
    .tree { display: grid; gap: 12px; }
    .graph-scroll { overflow-x: auto; overflow-y: hidden; margin: 0 -8px; padding: 8px; border: 1px solid var(--line); border-radius: 12px; background: #eef2f8; }
    .graph-canvas { position: relative; display: grid; grid-template-columns: repeat(5, minmax(220px, 255px)); gap: 52px; min-width: 1530px; min-height: 620px; padding: 26px 28px 42px; }
    .graph-edges { position: absolute; z-index: 5; inset: 0; overflow: visible; pointer-events: none; }
    .graph-edges path { fill: none; stroke: #aebbd0; stroke-width: 1.7; opacity: .82; }
    .graph-edges path.edge-depends-on { stroke: #00a884; stroke-width: 3.2; }
    .graph-edges path.edge-provides { stroke: #7c3aed; stroke-width: 2.4; stroke-dasharray: 4 3; }
    .graph-edges path.edge-primitive-member { stroke: #a7d8ca; stroke-width: 1.8; opacity: .78; }
    .graph-edges path.edge-contains { stroke: #d79a22; stroke-dasharray: 5 3; }
    .graph-edges path.edge-checks { stroke: #0f766e; stroke-dasharray: 2 3; }
    .graph-edges path.edge-uses-property { stroke: #7c4dff; }
    .graph-edges path.edge-uses-property.edge-template { stroke: #7c4dff; }
    .graph-edges path.edge-uses-property.edge-setup { stroke: #72a9d2; }
    .graph-edges path.edge-uses-property.edge-both { stroke: #ae70c7; }
    .graph-edges path.edge-reads, .graph-edges path.edge-writes, .graph-edges path.edge-subscribes, .graph-edges path.edge-triggers { stroke: #1292c9; stroke-dasharray: 3 3; }
    .graph-edges path.edge-calls { stroke: #e67e22; stroke-width: 2.2; }
    .graph-column { position: relative; display: grid; align-content: start; gap: 13px; min-width: 0; }
    .graph-column-title { position: sticky; top: 0; z-index: 3; padding: 6px 8px; border-bottom: 1px solid #cfd8e6; color: var(--muted); background: rgba(238, 242, 248, .94); font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
    .graph-card { position: relative; z-index: 6; display: grid; gap: 5px; min-width: 0; min-height: 68px; padding: 10px 12px; border: 1px solid var(--line); border-left: 4px solid #8a96a8; border-radius: 9px; background: var(--panel); box-shadow: 0 4px 12px rgba(25, 38, 65, .08); text-align: left; cursor: pointer; }
    .graph-card:hover, .graph-card.selected { border-color: #9eafff; box-shadow: 0 0 0 3px var(--accent-soft), 0 5px 14px rgba(25, 38, 65, .09); }
    .graph-card .node-kind { min-width: 0; }
    .graph-card .node-label { display: block; white-space: normal; overflow-wrap: anywhere; }
    .graph-card .node-file { display: block; margin: 0; white-space: normal; overflow-wrap: anywhere; }
    .graph-card.kind-route { border-left-color: #315efb; }
    .graph-card.kind-component { border-left-color: #7c4dff; }
    .graph-card.kind-service { border-left-color: #00a884; }
    .graph-card.kind-property { border-left-color: #e19a00; }
    .graph-card.kind-primitive { border-left-color: #e05d8f; }
    .graph-card.kind-source { border-left-color: #1292c9; }
    .graph-card.kind-http-endpoint { border-left-color: #0f766e; }
    .graph-card.kind-unique { border-left-color: #c026d3; }
    .graph-card.kind-route-hook { border-left-color: #7d8798; }
    .graph-card.kind-app-config { border-left-color: #0369a1; }
    .graph-card .card-topline { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .graph-card .card-topline .badge { margin-left: auto; }
    .graph-block { display: grid; gap: 8px; padding: 10px; border: 1px solid #cfd9e8; border-radius: 12px; background: rgba(255, 255, 255, .72); box-shadow: 0 4px 12px rgba(25, 38, 65, .045); }
    .graph-block > .graph-card { box-shadow: 0 3px 9px rgba(25, 38, 65, .08); }
    .component-parts { display: grid; gap: 8px; }
    .component-part { display: grid; gap: 6px; padding: 8px; border: 1px solid #dce4ef; border-radius: 9px; background: rgba(248, 250, 253, .92); }
    .component-part-title { color: var(--muted); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .component-anchor { position: relative; z-index: 6; display: flex; align-items: center; min-height: 28px; padding: 5px 8px; border: 1px dashed #b9c9dc; border-radius: 6px; background: #fff; color: #52647d; font-size: 11px; font-weight: 700; }
    .component-empty { color: #9aa7b8; font-size: 11px; font-style: italic; }
    .graph-internals { display: grid; gap: 6px; margin: 0 0 1px 15px; padding: 9px 8px 8px 11px; border-left: 2px solid #cbd6e5; border-radius: 0 8px 8px 0; background: #f5f8fc; }
    .internal-title { color: var(--muted); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .internal-node { display: grid; gap: 4px; }
    .internal-relation { color: var(--muted); font-size: 10px; }
    .internal-node .graph-card { min-height: 54px; padding: 8px 9px; box-shadow: none; }
    .internal-node .graph-card .node-file { font-size: 10px; }
    .tree-item { position: relative; }
    .tree-item.depth-1 { margin-left: 22px; }
    .tree-item.depth-2 { margin-left: 44px; }
    .tree-item.depth-3 { margin-left: 66px; }
    .tree-item.depth-4 { margin-left: 88px; }
    .tree-item.depth-5 { margin-left: 110px; }
    .tree-item:before { content: ""; position: absolute; left: -14px; top: 0; bottom: 0; border-left: 1px solid var(--line); }
    .tree-item.depth-0:before { display: none; }
    .tree-children { display: grid; gap: 7px; margin: 9px 0 0 42px; padding: 10px 12px 11px 14px; border: 1px solid #dfe6f1; border-left: 3px solid #c5d0e0; border-radius: 0 11px 11px 0; background: linear-gradient(90deg, #f8faff, #ffffff); }
    .tree-children > .tree-item { margin-left: 0; }
    .tree-children > .tree-item:before { left: -16px; top: -8px; bottom: -8px; border-color: #c5d0e0; }
    .relation-group { display: grid; gap: 6px; padding-top: 2px; }
    .relation-group + .relation-group { margin-top: 7px; padding-top: 10px; border-top: 1px dashed #d8e0ec; }
    .group-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .group-title span:last-child { min-width: 19px; padding: 1px 5px; border-radius: 999px; background: #e9eef6; text-align: center; font-size: 10px; letter-spacing: 0; }
    .node-row { display: flex; align-items: stretch; gap: 6px; min-width: 0; }
    .toggle { width: 28px; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
    .toggle.empty { visibility: hidden; }
    .node { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); box-shadow: 0 2px 8px rgba(25, 38, 65, .035); text-align: left; cursor: pointer; }
    .node:hover, .node.selected { border-color: #9eafff; box-shadow: 0 0 0 3px var(--accent-soft); }
    .node-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .node-kind { flex: 0 0 auto; min-width: 76px; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .07em; }
    .node-file { min-width: 0; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
    .kind-route { border-left: 4px solid #315efb; }
    .kind-component { border-left: 4px solid #7c4dff; }
    .kind-service { border-left: 4px solid #00a884; }
    .kind-property { border-left: 4px solid #e19a00; }
    .kind-primitive { border-left: 4px solid #e05d8f; }
    .kind-source { border-left: 4px solid #1292c9; }
    .kind-unique { border-left: 4px solid #c026d3; }
    .kind-route-hook { border-left: 4px solid #7d8798; }
    .kind-app-config { border-left: 4px solid #0369a1; }
    .edge-label { display: inline-flex; width: fit-content; margin: 0 0 -2px 0; padding: 1px 7px; border: 1px solid #dbe3ef; border-radius: 999px; background: #f1f5fa; color: var(--muted); font-size: 10px; }
    .empty { padding: 28px 14px; text-align: center; color: var(--muted); }
    .detail-empty { color: var(--muted); padding-top: 50px; text-align: center; }
    .detail-head { padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid var(--line); }
    .detail-head h2 { margin: 6px 0 3px; font-size: 19px; overflow-wrap: anywhere; }
    .detail-head p { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
    .detail-section { margin: 18px 0; }
    .detail-section h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
    .callout { padding: 11px 12px; border: 1px solid #f0d29a; border-radius: 9px; background: var(--warning-soft); color: var(--warning); }
    .detail-list { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
    .detail-list li { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
    .detail-list button { min-width: 0; padding: 0; border: 0; color: var(--accent); background: none; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
    .detail-list button:hover { text-decoration: underline; }
    .relation-kind { flex: 0 0 auto; color: var(--muted); font-size: 11px; }
    .meta-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .meta-table th, .meta-table td { padding: 5px 0; border-bottom: 1px solid var(--line); vertical-align: top; text-align: left; }
    .meta-table th { width: 40%; color: var(--muted); font-weight: 500; }
    .meta-table td { overflow-wrap: anywhere; }
    @media (max-width: 1100px) { .app { grid-template-columns: 230px minmax(360px, 1fr); } .details { grid-column: 1 / -1; border: 0; border-top: 1px solid var(--line); max-height: 420px; } }
    @media (max-width: 720px) { .app { display: block; } .topbar { flex-wrap: wrap; } .brand { min-width: 0; } .stats { margin-left: 0; } .sidebar, .details { max-height: none; border: 0; border-bottom: 1px solid var(--line); } .workspace { padding: 18px 14px 30px; } .node-file { display: none; } }
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand"><h1>CraftTS · Dependency Explorer</h1><p>Analyse statique AST + typage TypeScript</p></div>
      <label class="search"><span>⌕</span><input id="search" type="search" placeholder="Rechercher une route, un composant, un service…" aria-label="Rechercher"></label>
      <div class="stats" id="stats"></div>
    </header>
    <aside class="sidebar">
      <div class="side-title"><h2>Routes</h2><span class="badge" id="route-count"></span></div>
      <div class="route-list" id="routes"></div>
    </aside>
    <main class="workspace">
      <div class="workspace-head"><div><h2 id="route-title">Routes</h2><p id="route-subtitle">Sélectionnez une route pour explorer ses dépendances.</p></div></div>
      <div class="filter-bar" id="filters"></div>
      <div class="legend"><span class="legend-item"><span class="legend-line template"></span>Template</span><span class="legend-item"><span class="legend-line setup"></span>Setup</span><span class="legend-item"><span class="legend-line both"></span>Template + setup</span><span class="legend-item"><span class="legend-line depends"></span>Dépendance computed / state</span><span class="legend-item"><span class="legend-line calls"></span>Appel de méthode</span></div>
      <div class="tree" id="tree"></div>
    </main>
    <aside class="details" id="details"></aside>
  </div>
  <script>
    const GRAPH = ${serializedGraph};
    const nodes = new Map(GRAPH.nodes.map(function (node) { return [node.id, node]; }));
    const outgoing = new Map();
    const incoming = new Map();
    GRAPH.edges.forEach(function (edge) {
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      if (!incoming.has(edge.to)) incoming.set(edge.to, []);
      outgoing.get(edge.from).push(edge);
      incoming.get(edge.to).push(edge);
    });
    const routes = GRAPH.nodes.filter(function (node) { return node.kind === 'route'; });
    const services = GRAPH.nodes.filter(function (node) { return node.kind === 'service'; });
    const routeReachability = new Map();
    const serviceRoutes = new Map();
    const state = { routeId: routes[0] && routes[0].id, selectedId: routes[0] && routes[0].id, filter: 'all', search: '', expanded: new Set() };
    const filters = [['all', 'Tout'], ['component', 'Composants'], ['service', 'Services'], ['primitive', 'Primitives'], ['source', 'Sources'], ['unique', 'Uniques'], ['route-check', 'Preuves']];

    function esc(value) {
      return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function relativePath(filePath) {
      if (!filePath) return '';
      const rootPath = GRAPH.rootDir.split(String.fromCharCode(92)).join('/');
      const root = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
      const path = filePath.split(String.fromCharCode(92)).join('/');
      return path.indexOf(root + '/') === 0 ? path.slice(root.length + 1) : path;
    }
    function kindLabel(kind) {
      return ({ 'route': 'route', 'route-hook': 'hook', 'route-check': 'preuve', 'app-config': 'app config', 'component': 'composant', 'service': 'service', 'property': 'champ', 'primitive': 'primitive', 'source': 'source$', 'http-endpoint': 'http', 'unique': 'unique' })[kind] || kind;
    }
    function displayLabel(node) {
      if (!node) return '';
      return node.label;
    }
    function searchMatches(node) {
      if (!state.search) return true;
      const haystack = [node.label, node.kind, relativePath(node.filePath)].join(' ').toLowerCase();
      return haystack.indexOf(state.search.toLowerCase()) >= 0;
    }
    function relatedNodeIds(routeId) {
      const result = new Set([routeId]);
      const queue = [routeId];
      while (queue.length) {
        const current = queue.shift();
        (outgoing.get(current) || []).forEach(function (edge) {
          if (result.has(edge.to)) return;
          result.add(edge.to);
          queue.push(edge.to);
        });
        (incoming.get(current) || []).forEach(function (edge) {
          if (edge.kind !== 'checks' || result.has(edge.from)) return;
          result.add(edge.from);
          queue.push(edge.from);
        });
      }
      return result;
    }
    routes.forEach(function (route) {
      const ids = relatedNodeIds(route.id);
      routeReachability.set(route.id, ids);
      ids.forEach(function (id) {
        const node = nodes.get(id);
        if (node && node.kind === 'service') {
          if (!serviceRoutes.has(id)) serviceRoutes.set(id, []);
          serviceRoutes.get(id).push(route);
        }
      });
    });
    function serviceBadge(node) {
      const users = serviceRoutes.get(node.id) || [];
      return users.length > 1 ? '<span class="badge shared">partagé · ' + users.length + ' routes</span>' : '';
    }
    function edgeKinds(parentId, childId) {
      const outgoingKinds = (outgoing.get(parentId) || []).filter(function (edge) { return edge.to === childId; }).map(function (edge) { return edge.kind; });
      const incomingChecks = (incoming.get(parentId) || []).filter(function (edge) { return edge.from === childId && edge.kind === 'checks'; }).map(function () { return 'checks'; });
      return [...new Set(outgoingKinds.concat(incomingChecks))];
    }
    function childIds(nodeId) {
      const seen = new Set();
      const fromOutgoing = (outgoing.get(nodeId) || []).map(function (edge) { return edge.to; });
      const fromChecks = (incoming.get(nodeId) || []).filter(function (edge) { return edge.kind === 'checks'; }).map(function (edge) { return edge.from; });
      return fromOutgoing.concat(fromChecks).filter(function (id) {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    function relationGroupLabel(kinds) {
      if (kinds.some(function (kind) { return kind === 'checks'; })) return 'Preuves DI';
      if (kinds.some(function (kind) { return kind === 'loads' || kind === 'renders'; })) return 'Routes et composants';
      if (kinds.some(function (kind) { return kind === 'depends-on'; })) return 'Dépendances externes';
      if (kinds.some(function (kind) { return kind === 'provides'; })) return 'Providers';
      if (kinds.some(function (kind) { return kind === 'uses-property'; })) return 'Champs et states utilisés';
      if (kinds.some(function (kind) { return kind === 'calls'; })) return 'Méthodes appelées';
      if (kinds.some(function (kind) { return kind === 'reads' || kind === 'writes' || kind === 'subscribes' || kind === 'triggers'; })) return 'Interactions source$';
      if (kinds.some(function (kind) { return kind === 'contains'; })) return 'Contenu interne';
      return 'Relations';
    }
    function childGroups(nodeId) {
      const groups = new Map();
      childIds(nodeId).forEach(function (childId) {
        const kinds = edgeKinds(nodeId, childId);
        const label = relationGroupLabel(kinds);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push({ id: childId, kinds: kinds });
      });
      return [...groups.entries()];
    }
    function selectNode(id) {
      state.selectedId = id;
      renderTree();
      renderDetails();
    }
    function selectRoute(id) {
      state.routeId = id;
      state.selectedId = id;
      state.expanded = new Set([id]);
      childIds(id).forEach(function (childId) {
        const child = nodes.get(childId);
        if (child && child.kind === 'component') state.expanded.add(childId);
      });
      renderRoutes();
      renderTree();
      renderDetails();
    }
    function toggleNode(id) {
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      renderTree();
    }
    function renderRoutes() {
      const container = document.getElementById('routes');
      const visible = routes.filter(searchMatches);
      document.getElementById('route-count').textContent = visible.length + ' / ' + routes.length;
      if (!visible.length) { container.innerHTML = '<div class="empty">Aucune route trouvée.</div>'; return; }
      container.innerHTML = visible.map(function (route) {
        const ids = routeReachability.get(route.id) || new Set();
        const shared = services.filter(function (service) { return ids.has(service.id) && (serviceRoutes.get(service.id) || []).length > 1; }).length;
        return '<button class="route-button ' + (route.id === state.routeId ? 'active' : '') + '" data-route="' + esc(route.id) + '"><span class="route-label" title="' + esc(route.label) + '">' + esc(route.label) + '</span><span class="route-meta"><span>' + ids.size + '</span>' + (shared ? '<span class="badge shared">' + shared + '</span>' : '') + '</span></button>';
      }).join('');
      container.querySelectorAll('[data-route]').forEach(function (button) { button.addEventListener('click', function () { selectRoute(button.getAttribute('data-route')); }); });
    }
    function renderFilters() {
      document.getElementById('filters').innerHTML = filters.map(function (item) { return '<button class="filter ' + (state.filter === item[0] ? 'active' : '') + '" data-filter="' + item[0] + '">' + item[1] + '</button>'; }).join('');
      document.querySelectorAll('[data-filter]').forEach(function (button) { button.addEventListener('click', function () { state.filter = button.getAttribute('data-filter'); renderFilters(); renderTree(); }); });
    }
    function renderNode(nodeId, depth, trail) {
      const node = nodes.get(nodeId);
      if (!node || trail.has(nodeId)) return '';
      const groups = childGroups(nodeId).map(function (entry) {
        return [entry[0], entry[1].map(function (child) { return { node: nodes.get(child.id), kinds: child.kinds }; }).filter(function (child) { return Boolean(child.node); })];
      }).filter(function (entry) { return entry[1].length > 0; });
      const children = groups.reduce(function (all, entry) { return all.concat(entry[1].map(function (child) { return child.node; })); }, []);
      const matching = state.filter === 'all' || node.kind === state.filter;
      const isExpanded = state.expanded.has(nodeId);
      const childHtml = isExpanded ? groups.map(function (group) {
        return '<div class="relation-group"><div class="group-title"><span>' + esc(group[0]) + '</span><span>' + group[1].length + '</span></div>' + group[1].map(function (child) {
          return '<div class="edge-label">' + esc(child.kinds.join(' · ')) + '</div>' + renderNode(child.node.id, Math.min(depth + 1, 5), new Set([...trail, nodeId]));
        }).join('') + '</div>';
      }).join('') : '';
      if (!matching && !childHtml) return '';
      const file = relativePath(node.filePath) + (node.line ? ':' + node.line : '');
      const badges = node.kind === 'service' ? serviceBadge(node) : '';
      const selected = state.selectedId === node.id ? ' selected' : '';
      const toggleClass = children.length ? '' : ' empty';
      return '<div class="tree-item depth-' + depth + '"><div class="node-row"><button class="toggle' + toggleClass + '" data-toggle="' + esc(node.id) + '" aria-label="Déplier ou replier">' + (isExpanded ? '▾' : '▸') + '</button><button class="node kind-' + esc(node.kind) + selected + '" data-node="' + esc(node.id) + '" title="' + esc(file) + '"><span class="node-kind">' + esc(kindLabel(node.kind)) + '</span><span class="node-label">' + esc(displayLabel(node)) + '</span>' + badges + '<span class="node-file">' + esc(file) + '</span></button></div>' + (isExpanded && childHtml ? '<div class="tree-children">' + childHtml + '</div>' : '') + '</div>';
    }
    function renderFiltered(ids) {
      return [...ids].map(function (id) { return nodes.get(id); }).filter(function (node) { return node && node.id !== state.routeId && (state.filter === 'all' || node.kind === state.filter) && searchMatches(node); }).sort(function (a, b) { return a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label); }).map(function (node) { return renderNode(node.id, 1, new Set()); }).join('');
    }
    function graphColumn(node) {
      if (node.kind === 'route') return 0;
      if (node.kind === 'component' || node.kind === 'route-hook') return 1;
      if (node.kind === 'service') return state.graphServiceDependencyTargets.has(node.id) ? 3 : 2;
      return 4;
    }
    function graphColumnTitle(column) {
      return ['Route', 'Composants et hooks', 'Services du composant', 'Services utilisés par ces services', 'Détails et interactions'][column];
    }
    function graphCard(node) {
      const file = relativePath(node.filePath) + (node.line ? ':' + node.line : '');
      const selected = state.selectedId === node.id ? ' selected' : '';
      const badges = node.kind === 'service' ? serviceBadge(node) : '';
      return '<button class="graph-card kind-' + esc(node.kind) + selected + '" data-graph-node="' + esc(node.id) + '" title="' + esc(file) + '"><span class="card-topline"><span class="node-kind">' + esc(kindLabel(node.kind)) + '</span>' + badges + '</span><span class="node-label">' + esc(displayLabel(node)) + '</span><span class="node-file">' + esc(file) + '</span></button>';
    }
    function internalChildren(ownerId, ids) {
      return (outgoing.get(ownerId) || []).filter(function (edge) {
        return edge.kind === 'contains' && ids.has(edge.to) && nodes.has(edge.to);
      }).map(function (edge) { return edge.to; }).filter(function (id, index, all) { return all.indexOf(id) === index; });
    }
    function dependencyChildren(ownerId, ids) {
      return (outgoing.get(ownerId) || []).filter(function (edge) {
        return (edge.kind === 'depends-on' || edge.kind === 'calls' || edge.kind === 'provides') && ids.has(edge.to) && nodes.has(edge.to);
      }).map(function (edge) { return { id: edge.to, kind: edge.kind }; }).filter(function (item, index, all) {
        return all.findIndex(function (other) { return other.id === item.id && other.kind === item.kind; }) === index;
      });
    }
    function renderInternalNode(nodeId, ids, trail) {
      if (trail.has(nodeId)) return '';
      const node = nodes.get(nodeId);
      if (!node) return '';
      const children = internalChildren(nodeId, ids);
      const dependencies = dependencyChildren(nodeId, ids);
      const childHtml = children.map(function (childId) { return renderInternalNode(childId, ids, new Set([...trail, nodeId])); }).join('');
      const dependencyHtml = dependencies.map(function (item) {
        const target = nodes.get(item.id);
        return target ? '<div class="internal-node"><span class="internal-relation">' + (item.kind === 'calls' ? 'appelle' : item.kind === 'provides' ? 'provide' : 'dépend de') + '</span>' + graphCard(target) + '</div>' : '';
      }).join('');
      return '<div class="internal-node"><span class="internal-relation">contient</span>' + graphCard(node) + childHtml + dependencyHtml + '</div>';
    }
    function componentChildrenForUsage(ownerId, ids, usage) {
      return (outgoing.get(ownerId) || []).filter(function (edge) {
        const edgeUsage = edge.details && edge.details.usage;
        const matchesUsage = !edgeUsage || String(edgeUsage).split('+').indexOf(usage) >= 0;
        const isInternal = edge.kind === 'contains' || ((edge.kind === 'uses-property' || edge.kind === 'calls') && matchesUsage);
        return isInternal && ids.has(edge.to) && nodes.has(edge.to);
      }).map(function (edge) { return edge.to; }).filter(function (id, index, all) { return all.indexOf(id) === index; });
    }
    function renderComponentPart(owner, ids, usage, title) {
      const children = componentChildrenForUsage(owner.id, ids, usage);
      const content = children.length
        ? children.map(function (childId) { return renderInternalNode(childId, ids, new Set([owner.id])); }).join('')
        : '<span class="component-empty">Aucun élément interne détecté</span>';
      return '<section class="component-part"><div class="component-part-title">' + title + '</div><div class="component-anchor" data-graph-anchor="' + esc(owner.id + '::' + usage) + '">' + title + '</div>' + content + '</section>';
    }
    function renderComponentBlock(node, ids) {
      return '<div class="graph-block">' + graphCard(node) + '<div class="component-parts">' + renderComponentPart(node, ids, 'setup', 'Setup') + renderComponentPart(node, ids, 'template', 'Template') + '</div></div>';
    }
    function renderGraphBlock(node, ids) {
      if (node.kind === 'component') return renderComponentBlock(node, ids);
      const children = internalChildren(node.id, ids);
      if (!children.length) return graphCard(node);
      return '<div class="graph-block">' + graphCard(node) + '<div class="graph-internals"><div class="internal-title">Contenu interne · ' + children.length + '</div>' + children.map(function (childId) { return renderInternalNode(childId, ids, new Set([node.id])); }).join('') + '</div></div>';
    }
    function graphEndpointKey(nodeId, edge, source) {
      const node = nodes.get(nodeId);
      if (!source || !node || node.kind !== 'component') return nodeId;
      const usage = edge.details && edge.details.usage;
      return nodeId + '::' + (usage && String(usage).indexOf('template') >= 0 ? 'template' : 'setup');
    }
    function renderGraph(ids) {
      const visibleNodes = [...ids].map(function (id) { return nodes.get(id); }).filter(function (node) {
        return node && (node.id === state.routeId || ((state.filter === 'all' || node.kind === state.filter) && searchMatches(node)));
      });
      state.graphIds = new Set(visibleNodes.map(function (node) { return node.id; }));
      state.graphServiceDependencyTargets = new Set();
      (GRAPH.edges || []).filter(function (edge) {
        return edge.kind === 'depends-on' && state.graphIds.has(edge.from) && state.graphIds.has(edge.to);
      }).forEach(function (edge) {
        const target = nodes.get(edge.to);
        const source = nodes.get(edge.from);
        if (target && target.kind === 'service' && source && (source.kind === 'service' || source.kind === 'primitive')) {
          state.graphServiceDependencyTargets.add(target.id);
        }
      });
      state.graphInternalOwner = new Map();
      visibleNodes.filter(function (node) { return node.kind === 'route' || node.kind === 'component' || node.kind === 'service'; }).forEach(function (owner) {
        const queue = internalChildren(owner.id, state.graphIds);
        const visited = new Set();
        while (queue.length) {
          const childId = queue.shift();
          if (visited.has(childId)) continue;
          visited.add(childId);
          state.graphInternalOwner.set(childId, owner.id);
          internalChildren(childId, state.graphIds).forEach(function (nestedId) { queue.push(nestedId); });
        }
      });
      const columns = [[], [], [], [], []];
      visibleNodes.filter(function (node) { return !state.graphInternalOwner.has(node.id); }).forEach(function (node) { columns[graphColumn(node)].push(node); });
      columns.forEach(function (column) { column.sort(function (a, b) { return a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label); }); });
      const columnHtml = columns.map(function (column, index) {
        return '<section class="graph-column"><div class="graph-column-title">' + graphColumnTitle(index) + ' <span>(' + column.length + ')</span></div>' + (column.length ? column.map(function (node) { return renderGraphBlock(node, state.graphIds); }).join('') : '<div class="empty">Aucun nœud</div>') + '</section>';
      }).join('');
      return '<div class="graph-scroll"><div class="graph-canvas" id="graph-canvas"><svg class="graph-edges" aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa9bf"></path></marker><marker id="arrow-depends" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#00a884"></path></marker><marker id="arrow-primitive-member" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a7d8ca"></path></marker></defs></svg>' + columnHtml + '</div></div>';
    }
    function drawGraphEdges() {
      const canvas = document.getElementById('graph-canvas');
      if (!canvas) return;
      const svg = canvas.querySelector('.graph-edges');
      const bounds = canvas.getBoundingClientRect();
      const elements = new Map([...canvas.querySelectorAll('[data-graph-node], [data-graph-anchor]')].map(function (element) { return [element.getAttribute('data-graph-node') || element.getAttribute('data-graph-anchor'), element]; }));
      svg.setAttribute('width', canvas.scrollWidth);
      svg.setAttribute('height', canvas.scrollHeight);
      svg.setAttribute('viewBox', '0 0 ' + canvas.scrollWidth + ' ' + canvas.scrollHeight);
      svg.querySelectorAll('path.graph-edge').forEach(function (element) { element.remove(); });
      (GRAPH.edges || []).filter(function (edge) { return state.graphIds.has(edge.from) && state.graphIds.has(edge.to); }).forEach(function (edge) {
        const fromOwner = state.graphInternalOwner.get(edge.from);
        const toOwner = state.graphInternalOwner.get(edge.to);
        if (fromOwner && fromOwner === toOwner && edge.kind === 'contains') return;
        const from = elements.get(graphEndpointKey(edge.from, edge, true));
        const to = elements.get(graphEndpointKey(edge.to, edge, false));
        if (!from || !to) return;
        const fromBox = from.getBoundingClientRect();
        const toBox = to.getBoundingClientRect();
        const fromX = fromBox.left - bounds.left;
        const fromY = fromBox.top - bounds.top;
        const toX = toBox.left - bounds.left;
        const toY = toBox.top - bounds.top;
        let startX;
        let startY;
        let endX;
        let endY;
        let pathData;
        if (Math.abs(toX - fromX) < 35) {
          startX = fromX + fromBox.width / 2;
          startY = fromY + fromBox.height;
          endX = toX + toBox.width / 2;
          endY = toY;
          const bend = Math.max(22, (endY - startY) / 2);
          pathData = 'M ' + startX + ' ' + startY + ' C ' + startX + ' ' + (startY + bend) + ', ' + endX + ' ' + (endY - bend) + ', ' + endX + ' ' + endY;
        } else if (toX > fromX) {
          startX = fromX + fromBox.width;
          startY = fromY + fromBox.height / 2;
          endX = toX;
          endY = toY + toBox.height / 2;
          const bend = Math.max(32, (endX - startX) / 2);
          pathData = 'M ' + startX + ' ' + startY + ' C ' + (startX + bend) + ' ' + startY + ', ' + (endX - bend) + ' ' + endY + ', ' + endX + ' ' + endY;
        } else {
          startX = fromX;
          startY = fromY + fromBox.height / 2;
          endX = toX + toBox.width;
          endY = toY + toBox.height / 2;
          const bend = Math.max(32, (startX - endX) / 2);
          pathData = 'M ' + startX + ' ' + startY + ' C ' + (startX - bend) + ' ' + startY + ', ' + (endX + bend) + ' ' + endY + ', ' + endX + ' ' + endY;
        }
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const sourceNode = nodes.get(edge.from);
        const targetNode = nodes.get(edge.to);
        const primitiveMemberEdge =
          edge.kind === 'depends-on' &&
          sourceNode?.kind === 'primitive' &&
          targetNode?.kind === 'property';
        const propertyUsageClass =
          edge.kind === 'uses-property'
            ? edge.details?.usage === 'template'
              ? ' edge-template'
              : edge.details?.usage === 'setup'
                ? ' edge-setup'
                : edge.details?.usage === 'setup+template'
                  ? ' edge-both'
                  : ''
            : '';
        path.setAttribute(
          'class',
          'graph-edge edge-' + edge.kind +
            (primitiveMemberEdge ? ' edge-primitive-member' : '') +
            propertyUsageClass,
        );
        path.setAttribute('d', pathData);
        path.setAttribute(
          'marker-end',
          primitiveMemberEdge
            ? 'url(#arrow-primitive-member)'
            : edge.kind === 'depends-on'
              ? 'url(#arrow-depends)'
              : 'url(#arrow)',
        );
        path.setAttribute('data-kind', edge.kind);
        svg.appendChild(path);
      });
    }
    function renderTree() {
      const route = nodes.get(state.routeId);
      const tree = document.getElementById('tree');
      if (!route) { tree.innerHTML = '<div class="empty">Aucune route disponible dans ce projet.</div>'; return; }
      const ids = routeReachability.get(route.id) || new Set();
      document.getElementById('route-title').textContent = route.label;
      document.getElementById('route-subtitle').textContent = ids.size + ' nœuds accessibles · ' + (serviceRoutesForRoute(route.id).length) + ' services · les badges orange signalent les dépendances partagées.';
      tree.innerHTML = renderGraph(ids) || '<div class="empty">Aucune dépendance détectée.</div>';
      tree.querySelectorAll('[data-graph-node]').forEach(function (button) { button.addEventListener('click', function () { selectNode(button.getAttribute('data-graph-node')); }); });
      requestAnimationFrame(drawGraphEdges);
    }
    function serviceRoutesForRoute(routeId) {
      const ids = routeReachability.get(routeId) || new Set();
      return services.filter(function (service) { return ids.has(service.id); });
    }
    function relationList(title, edges, targetKey) {
      if (!edges.length) return '';
      return '<div class="detail-section"><h3>' + title + '</h3><ul class="detail-list">' + edges.map(function (edge) { const target = nodes.get(edge[targetKey]); const relation = edge.kind === 'depends-on' ? '' : edge.kind; return target ? '<li>' + (relation ? '<span class="relation-kind">' + esc(relation) + '</span>' : '') + '<button data-detail-node="' + esc(target.id) + '">' + esc(target.label) + '</button></li>' : ''; }).join('') + '</ul></div>';
    }
    function renderDetails() {
      const node = nodes.get(state.selectedId);
      const container = document.getElementById('details');
      if (!node) { container.innerHTML = '<div class="detail-empty">Cliquez sur un nœud pour voir ses détails.</div>'; return; }
      const outgoingEdges = outgoing.get(node.id) || [];
      const incomingEdges = incoming.get(node.id) || [];
      const location = relativePath(node.filePath) + (node.line ? ':' + node.line : '');
      const users = node.kind === 'service' ? (serviceRoutes.get(node.id) || []) : [];
      let html = '<div class="detail-head"><span class="badge">' + esc(kindLabel(node.kind)) + '</span><h2>' + esc(node.label) + '</h2><p>' + esc(location || 'Emplacement inconnu') + '</p></div>';
      if (users.length > 1) {
        html += '<div class="callout"><strong>Service partagé</strong><br>Utilisé par ' + users.length + ' routes. Cette dépendance dépasse la route sélectionnée.</div><div class="detail-section"><h3>Routes utilisatrices</h3><ul class="detail-list">' + users.map(function (route) { return '<li><span class="relation-kind">route</span><button data-route-detail="' + esc(route.id) + '">' + esc(route.label) + '</button></li>'; }).join('') + '</ul></div>';
      } else if (node.kind === 'service') {
        html += '<div class="detail-section"><div class="badge">spécifique à la route affichée</div></div>';
      }
      const details = Object.entries(node.details || {});
      if (details.length) html += '<div class="detail-section"><h3>Métadonnées</h3><table class="meta-table">' + details.map(function (entry) { return '<tr><th>' + esc(entry[0]) + '</th><td>' + esc(Array.isArray(entry[1]) ? entry[1].join(', ') : typeof entry[1] === 'object' ? JSON.stringify(entry[1]) : entry[1]) + '</td></tr>'; }).join('') + '</table></div>';
      html += relationList('Dépend de / contient', outgoingEdges, 'to');
      html += relationList('Utilisé par', incomingEdges, 'from');
      html += '<div class="detail-section"><h3>Preuve</h3><p class="badge">' + (outgoingEdges.concat(incomingEdges).some(function (edge) { return edge.evidence === 'type'; }) ? 'TypeScript + AST' : 'AST') + '</p></div>';
      container.innerHTML = html;
      container.querySelectorAll('[data-detail-node]').forEach(function (button) { button.addEventListener('click', function () { selectNode(button.getAttribute('data-detail-node')); }); });
      container.querySelectorAll('[data-route-detail]').forEach(function (button) { button.addEventListener('click', function () { selectRoute(button.getAttribute('data-route-detail')); }); });
    }
    function renderStats() {
      const sharedCount = services.filter(function (service) { return (serviceRoutes.get(service.id) || []).length > 1; }).length;
      document.getElementById('stats').innerHTML = '<span><strong>' + routes.length + '</strong>routes</span><span><strong>' + GRAPH.nodes.length + '</strong>nœuds</span><span><strong>' + sharedCount + '</strong>services partagés</span>';
    }
    document.getElementById('search').addEventListener('input', function (event) { state.search = event.target.value.trim(); renderRoutes(); renderTree(); });
    renderStats();
    renderFilters();
    if (state.routeId) selectRoute(state.routeId); else { renderRoutes(); renderTree(); renderDetails(); }
  </script>
</body>
</html>
`;
}

function collectServices(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getExpression().getText() !== 'craftService') continue;
      const config = call
        .getArguments()[0]
        ?.asKind(SyntaxKind.ObjectLiteralExpression);
      const name =
        getStringProperty(config, 'name') ??
        inferNameFromServiceDeclaration(call);
      if (!name) continue;
      const node = addNode(builder, {
        id: `service:${sourceFile.getFilePath()}:${name}`,
        kind: 'service',
        label: name,
        filePath: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
        details: {
          scope: getStringProperty(config, 'scope'),
          appStart: getBooleanProperty(config, 'appStart') === true,
          browserBoundary:
            getBooleanProperty(config, 'browserBoundary') === true,
          outputProperties: [],
        },
      });
      const service: ServiceInfo = {
        node,
        helpers: new Set(),
        call,
        outputPropertyNames: new Set(),
      };
      const declaration = call.getFirstAncestorByKind(
        SyntaxKind.VariableDeclaration,
      );
      if (declaration) {
        addBindingNames(declaration.getNameNode(), service.helpers);
      }
      for (const helper of service.helpers) {
        const binding = findBindingElement(declaration?.getNameNode(), helper);
        const key = symbolKey(binding?.getNameNode().getSymbol());
        if (key) builder.serviceByHelperKey.set(key, service);
        const services = builder.servicesByHelperName.get(helper) ?? [];
        if (!services.includes(service)) services.push(service);
        builder.servicesByHelperName.set(helper, services);
      }
      service.outputType = [...service.helpers]
        .map((helper) =>
          call.getType().getProperty(helper)?.getTypeAtLocation(call),
        )
        .map((type) => getServiceHelperOutputType(type))
        .find((type) => type !== undefined);
      for (const property of service.outputType?.getProperties() ?? []) {
        service.outputPropertyNames.add(property.getName());
      }
      if (node.details) {
        node.details['outputProperties'] = [...service.outputPropertyNames];
        node.details['helpers'] = [...service.helpers];
      }
      builder.services.push(service);
    }
  }
  for (const service of builder.services) {
    collectProvides(builder, service.node.id, service.call.getArguments()[0]);
  }
}

function collectSources(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      const creator = call.getExpression().getText();
      if (!SOURCE_CREATORS.has(creator)) continue;
      const name = getStringArgument(call, 0) ?? creator;
      const variableNames = new Set<string>();
      const declaration = call.getFirstAncestorByKind(
        SyntaxKind.VariableDeclaration,
      );
      if (declaration)
        addBindingNames(declaration.getNameNode(), variableNames);
      const node = addNode(builder, {
        id: `source:${sourceFile.getFilePath()}:${name}:${call.getStartLineNumber()}`,
        kind: 'source',
        label: `${name} (${creator})`,
        filePath: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
        details: { creator },
      });
      builder.sources.push({ node, variableNames, call });
    }
  }
}

function collectCraftUniques(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getExpression().getText() !== 'craftUnique') continue;
      addCraftUniqueUsage(builder, call);
    }
  }
}

function collectComponents(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getExpression().getText() !== 'craftComponent') continue;
      const explicitLabel = getStringArgument(call, 0);
      const label =
        explicitLabel ?? `AnonymousComponent@${call.getStartLineNumber()}`;
      const component: ComponentInfo = {
        node: addNode(builder, {
          id: `component:${sourceFile.getFilePath()}:${label}`,
          kind: 'component',
          label,
          filePath: sourceFile.getFilePath(),
          line: call.getStartLineNumber(),
          ...(explicitLabel ? {} : { details: { anonymous: true } }),
        }),
        call,
        bindings: new Map(),
      };
      builder.components.push(component);
      collectProvides(builder, component.node.id, call.getArguments()[1]);
      const declaration = call.getFirstAncestorByKind(
        SyntaxKind.VariableDeclaration,
      );
      if (declaration) {
        for (const name of getBindingNames(declaration.getNameNode())) {
          builder.componentByVariable.set(name, component);
          const nameNode = findBindingNameNode(declaration.getNameNode(), name);
          const key = symbolKey(nameNode?.getSymbol());
          if (key) builder.componentByVariableKey.set(key, component);
          const components = builder.componentsByVariableName.get(name) ?? [];
          if (!components.includes(component)) components.push(component);
          builder.componentsByVariableName.set(name, components);
        }
      }
    }
  }
}

function collectRoutes(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getExpression().getText() !== 'craftRoutes') continue;
      const collectionName =
        getStringArgument(call, 0) ?? sourceFile.getBaseNameWithoutExtension();
      const routesName = getCraftRoutesBindingName(call) ?? collectionName;
      const routes = call
        .getArguments()[1]
        ?.asKind(SyntaxKind.ArrayLiteralExpression);
      if (!routes) continue;
      const routeInfos: RouteInfo[] = [];
      for (const element of routes.getElements()) {
        const routeCall = element.asKind(SyntaxKind.CallExpression);
        const object =
          element.asKind(SyntaxKind.ObjectLiteralExpression) ??
          (routeCall?.getExpression().getText() === 'craftRoute'
            ? routeCall
                .getArguments()[1]
                ?.asKind(SyntaxKind.ObjectLiteralExpression)
            : undefined);
        if (!object) continue;
        const path =
          getStringProperty(object, 'path') ??
          (routeCall ? getStringArgument(routeCall, 0) : undefined) ??
          '<dynamic>';
        const label = `${collectionName}:${path}`;
        const route: RouteInfo = {
          node: addNode(builder, {
            id: `route:${sourceFile.getFilePath()}:${label}`,
            kind: 'route',
            label,
            filePath: sourceFile.getFilePath(),
            line: object.getStartLineNumber(),
            details: {
              collection: collectionName,
              path,
              routesName,
              hasComponent: routeHasTargetComponent(object),
              hasPendingComponent: Boolean(
                object.getProperty('pendingComponent'),
              ),
              hasErrorComponent: Boolean(object.getProperty('errorComponent')),
            },
          }),
          sourceFile,
          object,
          routesName,
          collectionName,
        };
        routeInfos.push(route);
        analyzeRouteObject(builder, route);
      }
      const existing = builder.routeFiles.get(sourceFile.getFilePath()) ?? [];
      builder.routeFiles.set(sourceFile.getFilePath(), [
        ...existing,
        ...routeInfos,
      ]);
    }
  }
}

function collectAppConfigs(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getExpression().getText() !== 'craftAppConfig') continue;
      const object = call
        .getArguments()[0]
        ?.asKind(SyntaxKind.ObjectLiteralExpression);
      if (!object) continue;
      const declaration = call.getFirstAncestorByKind(
        SyntaxKind.VariableDeclaration,
      );
      const nameNode = declaration?.getNameNode();
      const label =
        nameNode && Node.isIdentifier(nameNode)
          ? nameNode.getText()
          : 'appConfig';
      const calls = object.getDescendantsOfKind(SyntaxKind.CallExpression);
      const globalErrorCall = calls.find(
        (item) =>
          item.getExpression().getText() ===
            'provideCraftGlobalErrorComponent' ||
          item.getExpression().getText() === 'withErrorComponent',
      );
      const routeLoadErrorCall = calls.find(
        (item) =>
          item.getExpression().getText() ===
            'provideCraftRouteLoadErrorComponent' ||
          item.getExpression().getText() === 'withRouteLoadError',
      );
      builder.appConfigs.push({
        node: addNode(builder, {
          id: `app-config:${sourceFile.getFilePath()}:${label}`,
          kind: 'app-config',
          label,
          filePath: sourceFile.getFilePath(),
          line: object.getStartLineNumber(),
          details: {
            hasGlobalError: Boolean(globalErrorCall),
            hasRouteLoadError: Boolean(routeLoadErrorCall),
            globalErrorComponent: appConfigComponentName(globalErrorCall),
            routeLoadErrorComponent: appConfigComponentName(routeLoadErrorCall),
          },
        }),
        sourceFile,
        object,
      });
    }
  }
}

function appConfigComponentName(
  call: CallExpression | undefined,
): string | undefined {
  if (!call) return undefined;
  const first = call.getArguments()[0];
  if (!first) return undefined;
  if (Node.isIdentifier(first)) return first.getText();
  const object = first.asKind(SyntaxKind.ObjectLiteralExpression);
  const component = object
    ?.getProperty('component')
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer();
  return component && Node.isIdentifier(component)
    ? component.getText()
    : undefined;
}

function getCraftRoutesBindingName(call: CallExpression): string | undefined {
  const declaration = call.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  const nameNode = declaration?.getNameNode();
  if (!nameNode) return undefined;
  if (Node.isIdentifier(nameNode)) return nameNode.getText();
  if (!Node.isObjectBindingPattern(nameNode)) return undefined;
  const collection = call.getArguments()[0];
  const expected = Node.isStringLiteral(collection)
    ? `${uncapitalize(toPascalCase(collection.getLiteralValue()))}Routes`
    : undefined;
  const routeBindings = nameNode
    .getElements()
    .filter((element) =>
      (element.getPropertyNameNode()?.getText() ?? element.getName()).endsWith(
        'Routes',
      ),
    );
  const match = routeBindings.find(
    (element) =>
      expected !== undefined &&
      (element.getPropertyNameNode()?.getText() ?? element.getName()) ===
        expected,
  );
  return (
    match?.getName() ??
    (routeBindings.length === 1 ? routeBindings[0].getName() : undefined)
  );
}

function toPascalCase(value: string): string {
  return (
    value
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') || 'Routes'
  );
}

function uncapitalize(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function routeHasTargetComponent(object: ObjectLiteralExpression): boolean {
  if (
    object
      .getProperties()
      .some(
        (property) =>
          Node.isPropertyAssignment(property) &&
          ['component', 'componentDeps', 'loadComponent'].includes(
            property.getName(),
          ),
      )
  ) {
    return true;
  }
  return object
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((call) => call.getExpression().getText() === 'loadCraftComponent');
}

type TypeCheckHints = {
  imports: string[];
  strings: string[];
  typeofNames: string[];
};

type ResolvedRouteCheck = {
  mechanism: RouteCheckMechanism;
  hintNodes: Node[];
};

function collectRouteChecks(builder: GraphBuilder): void {
  const files = new Map<
    string,
    { sourceFile: SourceFile; routes: RouteInfo[]; appConfig?: AppConfigInfo }
  >();
  for (const routes of builder.routeFiles.values()) {
    const sourceFile = routes[0]?.sourceFile;
    if (!sourceFile) continue;
    files.set(sourceFile.getFilePath(), { sourceFile, routes });
  }
  for (const appConfig of builder.appConfigs) {
    const path = appConfig.sourceFile.getFilePath();
    const existing = files.get(path);
    if (existing) {
      existing.appConfig = appConfig;
      continue;
    }
    files.set(path, {
      sourceFile: appConfig.sourceFile,
      routes: [],
      appConfig,
    });
  }

  for (const { sourceFile, routes, appConfig } of files.values()) {
    const aliases = new Map(
      sourceFile.getTypeAliases().map((alias) => [alias.getName(), alias]),
    );

    for (const alias of sourceFile.getTypeAliases()) {
      const typeNode = alias.getTypeNode();
      if (!typeNode || !Node.isTypeReference(typeNode)) continue;
      const typeName = typeNode.getTypeName().getText();
      if (typeName === 'CanRun') {
        const canRun = addRouteCheckNode(
          builder,
          sourceFile,
          alias.getName(),
          'CanRun',
          alias.getStartLineNumber(),
        );
        const innerNode = typeNode.getTypeArguments()[0];
        if (!innerNode) continue;
        const inner = resolveRouteCheck(innerNode, aliases, new Set());
        if (!inner || inner.mechanism === 'CanRun') continue;
        const innerRef = Node.isTypeReference(innerNode)
          ? innerNode
          : undefined;
        const innerName = innerRef?.getTypeName().getText();
        const mapperName =
          innerName &&
          aliases.has(innerName) &&
          (innerRef?.getTypeArguments().length ?? 0) === 0
            ? innerName
            : `${alias.getName()}:${inner.mechanism}`;
        const mapper = addRouteCheckNode(
          builder,
          sourceFile,
          mapperName,
          inner.mechanism,
          alias.getStartLineNumber(),
        );
        addEdge(builder, canRun.id, mapper.id, 'contains', 'ast');
        linkMapperToRoutes(builder, mapper.id, inner, routes);
        linkMapperToAppConfig(builder, mapper.id, inner, appConfig);
        continue;
      }
      if (alias.getTypeParameters().length > 0) continue;
      const resolved = resolveRouteCheck(typeNode, aliases, new Set());
      if (!resolved || resolved.mechanism === 'CanRun') continue;
      const mapper = addRouteCheckNode(
        builder,
        sourceFile,
        alias.getName(),
        resolved.mechanism,
        alias.getStartLineNumber(),
      );
      linkMapperToRoutes(builder, mapper.id, resolved, routes);
      linkMapperToAppConfig(builder, mapper.id, resolved, appConfig);
    }

    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (
        call.getExpression().getText() !== 'assertExhaustiveRouteExceptions'
      ) {
        continue;
      }
      const targetName = call.getArguments()[0]?.getText();
      const assertNode = addRouteCheckNode(
        builder,
        sourceFile,
        `assertExhaustiveRouteExceptions:${targetName ?? call.getStartLineNumber()}`,
        'assertExhaustiveRouteExceptions',
        call.getStartLineNumber(),
      );
      for (const route of routes) {
        if (!targetName || route.routesName === targetName) {
          addEdge(builder, assertNode.id, route.node.id, 'checks', 'ast', {
            target: 'collection',
          });
        }
      }
    }
  }
}

function addRouteCheckNode(
  builder: GraphBuilder,
  sourceFile: SourceFile,
  name: string,
  mechanism: RouteCheckMechanism,
  line: number,
): DependencyGraphNode {
  return addNode(builder, {
    id: `route-check:${sourceFile.getFilePath()}:${name}`,
    kind: 'route-check',
    label: `${mechanism} ${name}`,
    filePath: sourceFile.getFilePath(),
    line,
    details: { mechanism, name },
  });
}

function resolveRouteCheck(
  typeNode: Node,
  aliases: Map<string, { getName(): string; getTypeNode(): Node | undefined }>,
  visited: Set<string>,
): ResolvedRouteCheck | undefined {
  if (!Node.isTypeReference(typeNode)) return undefined;
  const name = typeNode.getTypeName().getText();
  const canonical: RouteCheckMechanism[] = [
    'CanRun',
    'ValidateCascadeRoutesFile',
    'RouteCheckedDI',
    'RouteExceptionComponentCheckedDI',
  ];
  if (canonical.includes(name as RouteCheckMechanism)) {
    return { mechanism: name as RouteCheckMechanism, hintNodes: [typeNode] };
  }
  if (visited.has(name)) return undefined;
  visited.add(name);
  const alias = aliases.get(name);
  const body = alias?.getTypeNode();
  if (!body) return undefined;
  const inner = resolveRouteCheck(body, aliases, visited);
  if (!inner) return undefined;
  return {
    mechanism: inner.mechanism,
    hintNodes: [typeNode, ...inner.hintNodes],
  };
}

function collectTypeCheckHints(node: Node): TypeCheckHints {
  const text = node.getText();
  return {
    imports: [...text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
      (match) => match[1] ?? '',
    ),
    strings: [
      ...(Node.isStringLiteral(node) ? [node.getLiteralValue()] : []),
      ...node
        .getDescendantsOfKind(SyntaxKind.StringLiteral)
        .map((literal) => literal.getLiteralValue()),
    ],
    typeofNames: [...text.matchAll(/\btypeof\s+([A-Za-z_$][\w$]*)/g)].map(
      (match) => match[1] ?? '',
    ),
  };
}

function mergeTypeCheckHints(nodes: readonly Node[]): TypeCheckHints {
  const merged: TypeCheckHints = { imports: [], strings: [], typeofNames: [] };
  for (const node of nodes) {
    const hints = collectTypeCheckHints(node);
    merged.imports.push(...hints.imports);
    merged.strings.push(...hints.strings);
    merged.typeofNames.push(...hints.typeofNames);
  }
  return merged;
}

function linkMapperToRoutes(
  builder: GraphBuilder,
  mapperId: string,
  resolved: ResolvedRouteCheck,
  routes: readonly RouteInfo[],
): void {
  const hints = mergeTypeCheckHints(resolved.hintNodes);
  const pending = hints.strings.some((value) => /pending/i.test(value));
  const error = hints.strings.some((value) =>
    /error component|exception component/i.test(value),
  );
  for (const route of routes) {
    if (!routeCheckCoversRoute(hints, route)) continue;
    if (pending && route.node.details?.['hasPendingComponent']) {
      addEdge(builder, mapperId, route.node.id, 'checks', 'type', {
        target: 'pending',
      });
      continue;
    }
    if (error && route.node.details?.['hasErrorComponent']) {
      addEdge(builder, mapperId, route.node.id, 'checks', 'type', {
        target: 'error',
      });
      continue;
    }
    if (route.node.details?.['hasComponent']) {
      addEdge(builder, mapperId, route.node.id, 'checks', 'type', {
        target: 'component',
      });
    }
  }
}

function linkMapperToAppConfig(
  builder: GraphBuilder,
  mapperId: string,
  resolved: ResolvedRouteCheck,
  appConfig: AppConfigInfo | undefined,
): void {
  if (!appConfig) return;
  if (resolved.mechanism !== 'RouteExceptionComponentCheckedDI') return;
  const hints = mergeTypeCheckHints(resolved.hintNodes);
  const blob = [
    ...hints.strings,
    ...hints.typeofNames,
    ...resolved.hintNodes.map((node) => node.getText()),
  ].join(' ');
  const component = String(
    appConfig.node.details?.['globalErrorComponent'] ?? '',
  );
  const loadComponent = String(
    appConfig.node.details?.['routeLoadErrorComponent'] ?? '',
  );
  if (
    appConfig.node.details?.['hasGlobalError'] &&
    ((/global error/i.test(blob) && !/route load error/i.test(blob)) ||
      blobNamesComponent(blob, component))
  ) {
    addEdge(builder, mapperId, appConfig.node.id, 'checks', 'type', {
      target: 'global-error',
    });
  }
  if (
    appConfig.node.details?.['hasRouteLoadError'] &&
    (/route load error/i.test(blob) || blobNamesComponent(blob, loadComponent))
  ) {
    addEdge(builder, mapperId, appConfig.node.id, 'checks', 'type', {
      target: 'route-load-error',
    });
  }
}

function blobNamesComponent(blob: string, name: string): boolean {
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(?:typeof\\s+)?${escaped}\\b`).test(blob);
}

function routeCheckCoversRoute(
  hints: TypeCheckHints,
  route: RouteInfo,
): boolean {
  if (hints.typeofNames.includes(route.routesName)) return true;
  const routeImports = findDynamicImportSpecifiers(route.object);
  if (hints.imports.some((specifier) => routeImports.includes(specifier))) {
    return true;
  }
  const path = String(route.node.details?.['path'] ?? '');
  return hints.strings.some((value) => typeStringCoversPath(value, path));
}

function typeStringCoversPath(value: string, path: string): boolean {
  if (path === '') {
    return /path:\s*['"]{2}/.test(value) || value === '';
  }
  if (value === path) return true;
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(?:path:\\s*)?['"]${escaped}['"]`).test(value)) return true;
  return value.endsWith(`/${path}`) || value.endsWith(path);
}

function analyzeServiceBodies(builder: GraphBuilder): void {
  for (const service of builder.services) {
    const factory = service.call.getArguments()[1];
    if (!factory) continue;
    for (const call of factory.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      const httpClientUsage = findCraftHttpClientUsage(call);
      if (httpClientUsage) {
        const ownerNode = ownerNodeForCall(builder, call, service.node.id);
        addHttpClientUsage(builder, ownerNode.id, httpClientUsage, {
          ...(resourceLoaderFactory(call) ? { resourceRole: 'loader' } : {}),
        });
      }
      addServerFunctionUsage(builder, call, service.node.id);
      const temporalUsage = findCraftTemporalUsage(call);
      if (temporalUsage) {
        const ownerNode = ownerNodeForCall(builder, call, service.node.id);
        addTemporalUsage(builder, ownerNode.id, temporalUsage);
      }
      const helper = findServiceForCall(builder, call);
      if (helper && helper !== service) {
        addEdge(builder, service.node.id, helper.node.id, 'depends-on', 'type');
        addServiceDependency(builder, service.node.id, helper, call);
      }
      if (isPrimitiveFactory(call)) {
        addOwnedPrimitive(builder, call, service.node.id);
      }
    }
    const bindings = collectReactiveBindings(builder, factory, service.node.id);
    analyzeReactiveDependencies(builder, factory, bindings, service.node.id);
    addSourceInteractions(builder, service.node.id, factory);
  }
}

function analyzeComponents(builder: GraphBuilder): void {
  for (const component of builder.components) {
    const call = component.call;
    const setup = call.getArguments()[2];
    const template = call.getArguments()[3];
    for (const part of [setup, template]) {
      if (!part) continue;
      collectServiceBindingsFromReturns(component, part, builder);
      for (const nested of part.getDescendantsOfKind(
        SyntaxKind.CallExpression,
      )) {
        const httpClientUsage = findCraftHttpClientUsage(nested);
        if (httpClientUsage) {
          const ownerNode = ownerNodeForCall(
            builder,
            nested,
            component.node.id,
          );
          addHttpClientUsage(builder, ownerNode.id, httpClientUsage, {
            ...(resourceLoaderFactory(nested)
              ? { resourceRole: 'loader' }
              : {}),
          });
        }
        addServerFunctionUsage(builder, nested, component.node.id);
        const temporalUsage = findCraftTemporalUsage(nested);
        if (temporalUsage) {
          const ownerNode = ownerNodeForCall(
            builder,
            nested,
            component.node.id,
          );
          addTemporalUsage(builder, ownerNode.id, temporalUsage);
        }
        const helper =
          findServiceForCall(builder, nested) ??
          findComponentBoundService(component, nested);
        if (helper) {
          addEdge(
            builder,
            component.node.id,
            helper.node.id,
            'depends-on',
            'type',
          );
          addServiceDependency(builder, component.node.id, helper, nested);
          if (!nearestPrimitiveFactory(nested)) {
            collectServiceBindings(component, nested, helper);
          }
        }
        if (isPrimitiveFactory(nested)) {
          addOwnedPrimitive(builder, nested, component.node.id, {
            usage: part === setup ? 'setup' : 'template',
          });
        }
        const child = findComponentForCall(builder, nested);
        if (child && child !== component) {
          addEdge(builder, component.node.id, child.node.id, 'renders', 'ast');
        }
      }
      addSourceInteractions(builder, component.node.id, part);
    }
    const setupBindings = setup
      ? collectReactiveBindings(builder, setup, component.node.id, component)
      : new Map<string, ReactiveBinding>();
    if (setup) {
      analyzeReactiveDependencies(
        builder,
        setup,
        setupBindings,
        component.node.id,
      );
    }
    if (template) {
      analyzeTemplateDependencies(builder, component, template, setupBindings);
    }
    collectServicePropertyUses(builder, component);
  }
}

const NAMED_HTML_HELPERS = new Set([
  'a',
  'area',
  'article',
  'aside',
  'button',
  'caption',
  'dialog',
  'div',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'iframe',
  'img',
  'input',
  'label',
  'legend',
  'li',
  'main',
  'nav',
  'ol',
  'option',
  'p',
  'pre',
  'section',
  'select',
  'small',
  'span',
  'strong',
  'svg',
  'table',
  'tbody',
  'td',
  'textarea',
  'th',
  'thead',
  'tr',
  'ul',
]);

const INTERACTIVE_ELEMENT_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
]);

const INTERACTIVE_ELEMENT_HANDLERS = new Set([
  'click',
  'onClick',
  'input',
  'onInput',
  'change',
  'onChange',
  'submit',
  'onSubmit',
]);

type ParsedHyperscript = {
  tag: string;
  name?: string;
  nameKind: 'literal' | 'non-static' | 'missing';
  props?: ObjectLiteralExpression;
};

function collectInteractiveTemplateElements(builder: GraphBuilder): void {
  for (const component of builder.components) {
    const template = component.call.getArguments()[3];
    if (!template) continue;
    walkTemplate(template, (node) => {
      if (!Node.isCallExpression(node)) return;
      if (node.getExpression().getText() === 'craftComponent') return 'skip';
      const parsed = parseCraftHyperscript(node);
      if (!parsed || !isInteractiveElement(parsed)) return undefined;
      const filePath = node.getSourceFile().getFilePath();
      const element = addNode(builder, {
        id: `template-element:${filePath}:${node.getStartLineNumber()}:${node.getStart()}`,
        kind: 'template-element',
        label: parsed.name ?? '(unnamed)',
        filePath,
        line: node.getStartLineNumber(),
        details: {
          tag: parsed.tag,
          localName: parsed.name,
          static: parsed.nameKind !== 'non-static',
          missing: parsed.nameKind === 'missing',
          component: component.node.label,
        },
      });
      addEdge(builder, component.node.id, element.id, 'contains', 'ast');
      return undefined;
    });
  }
}

function walkTemplate(node: Node, visit: (node: Node) => 'skip' | void): void {
  if (visit(node) === 'skip') return;
  node.forEachChild((child) => walkTemplate(child, visit));
}

function parseCraftHyperscript(
  call: CallExpression,
): ParsedHyperscript | undefined {
  const callee = call.getExpression().getText();
  const args = call.getArguments();
  if (callee === 'h' || callee === 'customElement') {
    const tag = args[0]?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
    if (!tag) return undefined;
    return {
      tag,
      nameKind: 'missing',
      props: args[1]?.asKind(SyntaxKind.ObjectLiteralExpression),
    };
  }
  if (!NAMED_HTML_HELPERS.has(callee)) return undefined;
  const first = args[0];
  const second = args[1];
  if (
    first?.asKind(SyntaxKind.StringLiteral) &&
    (second?.asKind(SyntaxKind.ObjectLiteralExpression) ||
      second?.getKind() === SyntaxKind.NullKeyword)
  ) {
    return {
      tag: callee,
      name: first.asKind(SyntaxKind.StringLiteral)?.getLiteralValue(),
      nameKind: 'literal',
      props: second.asKind(SyntaxKind.ObjectLiteralExpression),
    };
  }
  if (first && Node.isObjectLiteralExpression(first)) {
    return { tag: callee, nameKind: 'missing', props: first };
  }
  if (
    first &&
    (second?.asKind(SyntaxKind.ObjectLiteralExpression) ||
      second?.getKind() === SyntaxKind.NullKeyword) &&
    !first.asKind(SyntaxKind.StringLiteral)
  ) {
    return {
      tag: callee,
      nameKind: 'non-static',
      props: second?.asKind(SyntaxKind.ObjectLiteralExpression),
    };
  }
  return { tag: callee, nameKind: 'missing' };
}

function isInteractiveElement(parsed: ParsedHyperscript): boolean {
  if (
    parsed.tag === 'input' &&
    getStringProperty(parsed.props, 'type') === 'hidden'
  ) {
    return false;
  }
  if (INTERACTIVE_ELEMENT_TAGS.has(parsed.tag)) return true;
  return hasInteractiveHandler(parsed.props);
}

function hasInteractiveHandler(
  props: ObjectLiteralExpression | undefined,
): boolean {
  if (!props) return false;
  return [...INTERACTIVE_ELEMENT_HANDLERS].some(
    (name) => props.getProperty(name) !== undefined,
  );
}

function analyzeInsertions(builder: GraphBuilder): void {
  const scopes: { node: Node; ownerId: string }[] = [];
  for (const service of builder.services) {
    const factory = service.call.getArguments()[1];
    if (factory) scopes.push({ node: factory, ownerId: service.node.id });
  }
  for (const component of builder.components) {
    const setup = component.call.getArguments()[2];
    if (setup) scopes.push({ node: setup, ownerId: component.node.id });
  }
  for (const { node, ownerId } of scopes) {
    for (const call of node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (isPrimitiveFactory(call)) {
        const primitive = primitiveFactoryName(call);
        const methods = primitive
          ? exposedPrimitiveMethods(call)
          : new Set<string>();
        if (primitive && methods.size > 0) {
          const primitiveNode = addPrimitiveNode(
            builder,
            call,
            primitive,
            ownerId,
          );
          primitiveNode.details = {
            ...(primitiveNode.details ?? {}),
            exposedMethods: [
              ...new Set([
                ...readStringArray(primitiveNode.details?.['exposedMethods']),
                ...methods,
              ]),
            ],
          };
          for (const method of methods) {
            const property = addPrimitiveMemberProperty(
              builder,
              primitiveNode.id,
              method,
              call,
            );
            property.details = {
              ...(property.details ?? {}),
              exposedMethod: true,
            };
          }
          addExposedPrimitiveMethodUsageEdges(
            builder,
            primitiveNode,
            call,
            methods,
          );
        }
      }
      const name = call.getExpression().getText();
      if (name === 'insertReactOnMutation') {
        addReactOnMutation(builder, call, ownerId);
      }
      if (STORAGE_PERSISTER_INSERTIONS.has(name)) {
        addStoragePersister(builder, call, ownerId);
      }
    }
  }
}

function addExposedPrimitiveMethodUsageEdges(
  builder: GraphBuilder,
  primitive: DependencyGraphNode,
  declaration: CallExpression,
  methods: ReadonlySet<string>,
): void {
  const variableDeclaration = primitiveVariableDeclaration(declaration);
  const bindingNodes = variableDeclaration
    ? bindingIdentifierNodes(variableDeclaration.getNameNode())
    : [];
  const bindingKeys = new Set(
    bindingNodes.map((node) => symbolKey(node.getSymbol())).filter(Boolean),
  );
  const bindingNames = new Set(
    bindingNodes.map((node) => node.getText()).concat(
      typeof primitive.details?.['name'] === 'string'
        ? [primitive.details['name']]
        : [],
    ),
  );
  const primitiveName =
    typeof primitive.details?.['name'] === 'string'
      ? primitive.details['name']
      : undefined;
  const namedPrimitiveCount = primitiveName
    ? [...builder.nodes.values()].filter(
        (node) =>
          node.kind === 'primitive' &&
          node.details?.['name'] === primitiveName,
      ).length
    : 0;
  const ownerId =
    typeof primitive.details?.['ownerId'] === 'string'
      ? primitive.details['ownerId']
      : primitive.id;

  for (const sourceFile of builder.project.getSourceFiles()) {
    for (const access of sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      const chain = propertyAccessChain(access);
      const root = rootIdentifier(access);
      const method = chain?.at(-1) ?? access.getName();
      const nestedMethod = chain?.at(-1);
      const isNamedNestedMethod =
        Boolean(primitiveName) &&
        (!root ||
          chain?.length !== 2 ||
          namedPrimitiveCount === 1) &&
        methods.has(method) &&
        access.getText().endsWith(`${primitiveName}.${method}`);
      if (
        (!root && !isNamedNestedMethod) ||
        (!isNamedNestedMethod && chain?.length !== 2) ||
        !method ||
        (!methods.has(method) && !isNamedNestedMethod) ||
        (!isNamedNestedMethod && !bindingNames.has(chain?.[0] ?? ''))
      ) {
        continue;
      }
      const key = root ? symbolKey(root.getSymbol()) : undefined;
      if (
        !isNamedNestedMethod &&
        variableDeclaration &&
        bindingKeys.size > 0 &&
        (!key || !bindingKeys.has(key))
      ) {
        continue;
      }
      if (
        !variableDeclaration &&
        access.getSourceFile().getFilePath() !== primitive.filePath
      ) {
        continue;
      }
      addEdge(
        builder,
        ownerId,
        `property:${primitive.id}:${method}`,
        'uses-property',
        'ast',
        {
          path: nestedMethod ?? method,
          callSite: {
            filePath: access.getSourceFile().getFilePath(),
            line: access.getStartLineNumber(),
            offset: access.getStart(),
          },
        },
      );
    }
  }
}

function primitiveVariableDeclaration(
  call: CallExpression,
): import('ts-morph').VariableDeclaration | undefined {
  let current: Node | undefined = call.getParent();
  while (current) {
    if (Node.isVariableDeclaration(current)) return current;
    if (
      Node.isArrowFunction(current) ||
      Node.isFunctionExpression(current) ||
      Node.isMethodDeclaration(current)
    ) {
      return undefined;
    }
    current = current.getParent();
  }
  return undefined;
}

function bindingIdentifierNodes(node: Node): import('ts-morph').Identifier[] {
  if (Node.isIdentifier(node)) return [node];
  if (Node.isObjectBindingPattern(node) || Node.isArrayBindingPattern(node)) {
    return node.getElements().flatMap((element) =>
      Node.isBindingElement(element)
        ? bindingIdentifierNodes(element.getNameNode())
        : [],
    );
  }
  return [];
}

function exposedPrimitiveMethods(call: CallExpression): Set<string> {
  const methods = new Set<string>();
  for (const argument of call.getArguments().slice(2)) {
    collectInsertionMethods(argument, methods);
  }
  return methods;
}

function collectInsertionMethods(node: Node, methods: Set<string>): void {
  const current = unwrapExpression(node);
  if (!current) return;

  if (
    (Node.isArrowFunction(current) || Node.isFunctionExpression(current)) &&
    isInsertionCallback(current)
  ) {
    const returned = returnedObject(current);
    for (const property of returned?.getProperties() ?? []) {
      if (Node.isPropertyAssignment(property)) {
        const value = property.getInitializer();
        if (
          value &&
          (Node.isArrowFunction(value) || Node.isFunctionExpression(value))
        ) {
          methods.add(property.getName());
        }
      } else if (Node.isMethodDeclaration(property)) {
        methods.add(property.getName());
      }
    }
    return;
  }

  if (
    Node.isCallExpression(current) &&
    Node.isIdentifier(current.getExpression()) &&
    INSERTION_PIPES.has(current.getExpression().getText())
  ) {
    for (const argument of current.getArguments()) {
      collectInsertionMethods(argument, methods);
    }
  }
}

function isInsertionCallback(
  node: import('ts-morph').ArrowFunction | import('ts-morph').FunctionExpression,
): boolean {
  const parameter = node.getParameters()[0]?.getNameNode();
  if (!parameter || !Node.isObjectBindingPattern(parameter)) return false;
  return parameter.getElements().some((element) =>
    INSERTION_CONTEXT_KEYS.has(
      element.getPropertyNameNode()?.getText() ?? element.getNameNode().getText(),
    ),
  );
}

function returnedObject(
  node: import('ts-morph').ArrowFunction | import('ts-morph').FunctionExpression,
): import('ts-morph').ObjectLiteralExpression | undefined {
  let body = node.getBody();
  if (Node.isParenthesizedExpression(body)) body = body.getExpression();
  if (Node.isObjectLiteralExpression(body)) return body;
  if (!Node.isBlock(body)) return undefined;
  const returned = body.getStatements().find(Node.isReturnStatement);
  const expression = returned?.getExpression();
  return expression && Node.isObjectLiteralExpression(expression)
    ? expression
    : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function addReactOnMutation(
  builder: GraphBuilder,
  call: CallExpression,
  ownerId: string,
): void {
  const host = nearestHostPrimitive(builder, call, ownerId, new Set(['query']));
  const mutationName = identifierText(call.getArguments()[0]);
  if (!host || !mutationName) return;
  const mutationNode = findOwnedPrimitive(
    builder,
    ownerId,
    mutationName,
    'mutation',
  );
  if (!mutationNode) return;
  addEdge(builder, mutationNode.id, host.id, 'triggers', 'ast', {
    insertion: 'react-on-mutation',
    line: call.getStartLineNumber(),
  });
}

function addStoragePersister(
  builder: GraphBuilder,
  call: CallExpression,
  ownerId: string,
): void {
  const host = nearestHostPrimitive(builder, call, ownerId);
  if (!host) return;
  const uniqueArgument = unwrapExpression(call.getArguments()[0]);
  const uniqueCall =
    uniqueArgument?.isKind(SyntaxKind.CallExpression) &&
    uniqueArgument.getExpression().getText() === 'craftUnique'
      ? uniqueArgument
      : undefined;
  host.details = {
    ...(host.details ?? {}),
    persisted: true,
    persistedUnique: Boolean(uniqueCall),
  };
}

function nearestHostPrimitive(
  builder: GraphBuilder,
  node: Node,
  aggregateOwnerId: string,
  hosts: ReadonlySet<string> = HOST_PRIMITIVES,
): DependencyGraphNode | undefined {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isCallExpression(current) && isPrimitiveFactory(current)) {
      const primitive = primitiveFactoryName(current);
      if (primitive && hosts.has(primitive)) {
        return addPrimitiveNode(builder, current, primitive, aggregateOwnerId);
      }
    }
    current = current.getParent();
  }
  return undefined;
}

function findOwnedPrimitive(
  builder: GraphBuilder,
  ownerId: string,
  name: string,
  primitive?: string,
): DependencyGraphNode | undefined {
  return [...builder.nodes.values()].find(
    (node) =>
      node.kind === 'primitive' &&
      node.details?.['ownerId'] === ownerId &&
      (primitive === undefined || node.details?.['primitive'] === primitive) &&
      (node.details?.['usage'] === name || node.details?.['name'] === name),
  );
}

function identifierText(node: Node | undefined): string | undefined {
  const current = unwrapExpression(node);
  if (!current) return undefined;
  if (Node.isIdentifier(current)) return current.getText();
  return undefined;
}

function analyzeRoutes(builder: GraphBuilder): void {
  for (const routeInfos of builder.routeFiles.values()) {
    for (const route of routeInfos) {
      for (const property of route.object.getProperties()) {
        if (!Node.isPropertyAssignment(property)) continue;
        if (property.getName() === 'component') {
          const component = findComponentForExpression(
            builder,
            property.getInitializer(),
          );
          if (component) {
            addEdge(builder, route.node.id, component.node.id, 'loads', 'ast');
          }
        }
        if (property.getName() === 'loadComponent') {
          for (const identifier of property.getDescendantsOfKind(
            SyntaxKind.Identifier,
          )) {
            const component = findComponentForExpression(builder, identifier);
            if (component) {
              addEdge(builder, route.node.id, component.node.id, 'loads', 'ast');
            }
          }
        }
      }
      const imports = findDynamicImportSpecifiers(route.object);
      for (const specifier of imports) {
        const target = resolveImportedSource(
          route.sourceFile,
          specifier,
          builder.project,
        );
        if (!target) continue;
        const exportNames = findDynamicImportExportNames(route.object, specifier);
        for (const component of builder.components.filter(
          (candidate) =>
            candidate.node.filePath === target.getFilePath() &&
            (exportNames === undefined ||
              exportNames.length === 0 ||
              componentExportNames(candidate).some((name) =>
                exportNames.includes(name),
              )),
        )) {
          addEdge(builder, route.node.id, component.node.id, 'loads', 'ast');
        }
        for (const childRoute of builder.routeFiles.get(target.getFilePath()) ??
          []) {
          addEdge(builder, route.node.id, childRoute.node.id, 'loads', 'ast');
        }
      }
      for (const property of route.object.getProperties()) {
        if (!Node.isPropertyAssignment(property)) continue;
        const name = property.getName();
        if (
          ![
            'canActivate',
            'canMatch',
            'resolve',
            'queryParams',
            'handleExceptions',
          ].includes(name)
        ) {
          continue;
        }
        const hook = addNode(builder, {
          id: `route-hook:${route.node.id}:${name}`,
          kind: 'route-hook',
          label: `${route.node.label}.${name}`,
          filePath: route.sourceFile.getFilePath(),
          line: property.getStartLineNumber(),
        });
        addEdge(builder, route.node.id, hook.id, 'contains', 'ast');
        collectRouteHookServiceDependencies(builder, hook.id, property);
      }
    }
  }
}

function collectRouteHookServiceDependencies(
  builder: GraphBuilder,
  hookId: string,
  property: Node,
): void {
  const visitedDeclarations = new Set<string>();
  const pendingScopes: Node[] = [property];

  while (pendingScopes.length > 0) {
    const scope = pendingScopes.shift();
    if (!scope) continue;

    for (const call of scope.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const httpClientUsage = findCraftHttpClientUsage(call);
      if (httpClientUsage) addHttpClientUsage(builder, hookId, httpClientUsage);
      const temporalUsage = findCraftTemporalUsage(call);
      if (temporalUsage) addTemporalUsage(builder, hookId, temporalUsage);
      const helper = findServiceForCall(builder, call);
      if (helper) {
        addEdge(builder, hookId, helper.node.id, 'depends-on', 'type');
      }

      for (const declaration of resolveCallableDeclarations(call)) {
        if (declaration.getSourceFile().isDeclarationFile()) continue;
        const declarationKey = `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`;
        if (visitedDeclarations.has(declarationKey)) continue;
        visitedDeclarations.add(declarationKey);
        pendingScopes.push(declaration);
      }
    }
  }
}

function resolveCallableDeclarations(call: CallExpression): Node[] {
  const identifier = rootIdentifier(call.getExpression());
  const symbol = identifier?.getSymbol();
  const resolved = symbol?.getAliasedSymbol() ?? symbol;
  return resolved?.getDeclarations() ?? [];
}

function analyzeRouteObject(builder: GraphBuilder, route: RouteInfo): void {
  collectProvides(builder, route.node.id, route.object);
}

function collectProvides(
  builder: GraphBuilder,
  ownerId: string,
  object: Node | undefined,
): void {
  if (!object || !Node.isObjectLiteralExpression(object)) return;
  const property = object.getProperty('providers');
  if (!property || !Node.isPropertyAssignment(property)) return;
  for (const call of property.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const helper = findServiceForCall(builder, call);
    if (!helper) continue;
    addEdge(builder, ownerId, helper.node.id, 'provides', 'type', {
      helper: call.getExpression().getText(),
    });
  }
}

function collectServiceBindings(
  component: ComponentInfo,
  serviceCall: CallExpression,
  service: ServiceInfo,
): void {
  const yieldExpression = serviceCall.getFirstAncestorByKind(
    SyntaxKind.YieldExpression,
  );
  const declaration = yieldExpression?.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  if (declaration) {
    for (const name of getBindingNames(declaration.getNameNode()))
      component.bindings.set(name, service);
  }
  const property = yieldExpression?.getFirstAncestorByKind(
    SyntaxKind.PropertyAssignment,
  );
  if (property) component.bindings.set(property.getName(), service);
}

function collectServiceBindingsFromReturns(
  component: ComponentInfo,
  part: Node,
  builder: GraphBuilder,
): void {
  for (const yieldExpression of part.getDescendantsOfKind(
    SyntaxKind.YieldExpression,
  )) {
    const expression = yieldExpression.getExpression();
    const call = expression?.asKind(SyntaxKind.CallExpression);
    if (!call) continue;
    if (nearestPrimitiveFactory(call)) continue;
    const service = findServiceForCall(builder, call);
    if (service) collectServiceBindings(component, call, service);
  }
}

function collectServicePropertyUses(
  builder: GraphBuilder,
  component: ComponentInfo,
): void {
  const parts = [
    [component.call.getArguments()[2], 'setup'],
    [component.call.getArguments()[3], 'template'],
  ] as const;
  for (const [part, usage] of parts) {
    if (!part) continue;
    for (const access of part.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      const chain = propertyAccessChain(access);
      if (!chain) continue;
      const service = component.bindings.get(chain[0]);
      if (!service || chain.length < 2) continue;
      let parentId = service.node.id;
      let currentType = service.outputType;
      for (const [index, propertyName] of chain.slice(1).entries()) {
        if (index > 0 && NON_DEPENDENCY_PROPERTY_NAMES.has(propertyName)) break;
        if (index > 0 && currentType?.isArray()) break;
        const property = currentType?.getProperty(propertyName);
        const propertyType = property?.getTypeAtLocation(access);
        const propertyPath = chain
          .slice(1, chain.indexOf(propertyName) + 1)
          .join('.');
        const propertyId = `property:${service.node.id}:${propertyPath}`;
        const propertyNode = addNode(builder, {
          id: propertyId,
          kind: 'property',
          label: `${service.node.label}.${propertyPath}`,
          filePath: component.node.filePath,
          line: access.getStartLineNumber(),
          details: {
            type: propertyType?.getText(access),
            declaredOnServiceType: Boolean(property),
            usedIn: usage,
          },
        });
        mergeUsageDetail(propertyNode, 'usedIn', usage);
        addEdge(builder, parentId, propertyNode.id, 'contains', 'type', {
          property: propertyName,
        });
        addEdge(
          builder,
          component.node.id,
          propertyNode.id,
          'uses-property',
          'type',
          {
            property: propertyName,
            usage,
          },
        );
        parentId = propertyNode.id;
        currentType = propertyType;
      }
    }
  }
}

function addSourceInteractions(
  builder: GraphBuilder,
  ownerId: string,
  node: Node,
): void {
  for (const source of builder.sources) {
    for (const name of source.variableNames) {
      for (const access of node.getDescendantsOfKind(
        SyntaxKind.PropertyAccessExpression,
      )) {
        const text = access.getText();
        const directSourceAccess = text.startsWith(`${name}.`);
        const exposedMachineSourceAccess = isExposedMachineSourceAccess(
          source,
          access,
          name,
        );
        if (!directSourceAccess && !exposedMachineSourceAccess) continue;
        const owner = ownerNodeForAst(builder, access, ownerId);
        if (text.endsWith('.emit') || text.endsWith('.set')) {
          addEdge(builder, owner.id, source.node.id, 'writes', 'ast', {
            operation: text.split('.').pop(),
            ...(exposedMachineSourceAccess
              ? { exposedThrough: 'state-machine' }
              : {}),
          });
        } else if (
          text.endsWith('.subscribe') ||
          text.endsWith('.asReadonly')
        ) {
          addEdge(builder, owner.id, source.node.id, 'subscribes', 'ast');
        } else {
          addEdge(builder, owner.id, source.node.id, 'reads', 'ast');
        }
      }
      for (const call of node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expression = call.getExpression().getText();
        if (expression !== 'on$' && expression !== 'afterRecomputation')
          continue;
        if (call.getArguments()[0]?.getText() === name) {
          const primitive = nearestPrimitiveFactory(call);
          addEdge(
            builder,
            source.node.id,
            primitive ? primitiveNodeId(builder, primitive) : ownerId,
            primitive ? 'triggers' : 'subscribes',
            'ast',
          );
        }
      }
    }
  }
}

/**
 * A state-machine insertion can expose a source under an alias such as
 * `machine.change$`. The source declaration is still the one nested in the
 * machine context factory, so connect that exposed access back to the source
 * node instead of leaving the graph at an anonymous machine property.
 */
function isExposedMachineSourceAccess(
  source: SourceInfo,
  access: PropertyAccessExpression,
  sourceName: string,
): boolean {
  const chain = propertyAccessChain(access);
  if (!chain || chain.length < 3 || !chain.includes(sourceName)) return false;
  const machineCall = nearestPrimitiveFactory(source.call);
  if (
    !machineCall ||
    primitiveFactoryName(machineCall) !== 'craftStateMachine'
  ) {
    return false;
  }
  const machineDeclaration = machineCall.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  const machineNames = new Set<string>();
  if (machineDeclaration) {
    addBindingNames(machineDeclaration.getNameNode(), machineNames);
  }
  if (!machineNames.has(chain[0] ?? '')) return false;
  const sourceIndex = chain.indexOf(sourceName);
  return sourceIndex > 0 && chain[sourceIndex + 1] === 'emit';
}

function primitiveNodeId(builder: GraphBuilder, call: CallExpression): string {
  const owner = nearestPrimitiveFactory(call) ?? call;
  const primitive =
    primitiveFactoryName(owner) ?? primitiveName(owner) ?? 'primitive';
  const sourceFile = call.getSourceFile();
  return `primitive:${sourceFile.getFilePath()}:${primitive}:${owner.getStartLineNumber()}`;
}

function ownerNodeForCall(
  builder: GraphBuilder,
  call: CallExpression,
  aggregateOwnerId: string,
): DependencyGraphNode {
  return ownerNodeForAst(builder, call, aggregateOwnerId);
}

function ownerNodeForAst(
  builder: GraphBuilder,
  node: Node,
  aggregateOwnerId: string,
): DependencyGraphNode {
  const ownerPrimitive = nearestPrimitiveFactory(node);
  const ownerPrimitiveName =
    ownerPrimitive && primitiveFactoryName(ownerPrimitive);
  return ownerPrimitive && ownerPrimitiveName
    ? addPrimitiveNode(
        builder,
        ownerPrimitive,
        ownerPrimitiveName,
        aggregateOwnerId,
      )
    : (builder.nodes.get(aggregateOwnerId) ?? {
        id: aggregateOwnerId,
        kind: 'service',
        label: aggregateOwnerId,
      });
}

function addOwnedPrimitive(
  builder: GraphBuilder,
  call: CallExpression,
  aggregateOwnerId: string,
  details?: Record<string, unknown>,
): DependencyGraphNode | undefined {
  const primitive = primitiveFactoryName(call);
  if (!primitive) return undefined;
  const primitiveNode = addPrimitiveNode(
    builder,
    call,
    primitive,
    aggregateOwnerId,
  );
  recordEffectLoaderRequirements(primitiveNode, call, primitive);
  const enclosing = nearestPrimitiveFactory(call);
  const enclosingName = enclosing && primitiveFactoryName(enclosing);
  const parentId =
    enclosing && enclosingName
      ? addPrimitiveNode(builder, enclosing, enclosingName, aggregateOwnerId).id
      : aggregateOwnerId;
  addEdge(builder, parentId, primitiveNode.id, 'contains', 'ast', details);
  return primitiveNode;
}

function recordEffectLoaderRequirements(
  primitiveNode: DependencyGraphNode,
  call: CallExpression,
  primitive: string,
): void {
  if (
    primitive !== 'queryEffect' &&
    primitive !== 'mutationEffect' &&
    primitive !== 'computedEffect'
  ) {
    return;
  }

  const config = call
    .getArguments()[1]
    ?.asKind(SyntaxKind.ObjectLiteralExpression);
  const callbacks: readonly (readonly [string, Node | undefined])[] =
    primitive === 'computedEffect'
      ? [['computed', call.getArguments()[1]]]
      : [
          [
            'loader',
            config
              ?.getProperty('loader')
              ?.asKind(SyntaxKind.PropertyAssignment)
              ?.getInitializer(),
          ],
          [
            'params',
            config
              ?.getProperty('params')
              ?.asKind(SyntaxKind.PropertyAssignment)
              ?.getInitializer(),
          ],
          [
            'method',
            config
              ?.getProperty('method')
              ?.asKind(SyntaxKind.PropertyAssignment)
              ?.getInitializer(),
          ],
        ];

  for (const [role, callback] of callbacks) {
    const returnType = callback
      ?.getType()
      .getCallSignatures()[0]
      ?.getReturnType();
    const effectType =
      (role === 'computed' || role === 'params') &&
      returnType?.getSymbol()?.getName() === 'Generator'
        ? returnType.getTypeArguments()[1]
        : returnType;
    const requirementType = effectType?.getTypeArguments()[2];
    if (!requirementType) continue;
    const requirements = requirementType.isUnion()
      ? requirementType.getUnionTypes()
      : [requirementType];
    const names = requirements
      .filter(
        (type) => !['never', 'unknown', 'undefined'].includes(type.getText()),
      )
      .map(
        (type) =>
          type.getSymbol()?.getName() ??
          type.getAliasSymbol()?.getName() ??
          type.getText().split('.').at(-1),
      )
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) {
      primitiveNode.details = {
        ...(primitiveNode.details ?? {}),
        [`${role}Requirements`]: [...new Set(names)],
      };
    }
  }
}

function linkEffectLoaderRequirements(builder: GraphBuilder): void {
  const effectServices = new Map(
    [...builder.nodes.values()]
      .filter(
        (node) =>
          node.kind === 'service' && node.details?.['runtime'] === 'effect',
      )
      .map((node) => [node.label, node]),
  );
  for (const primitive of builder.nodes.values()) {
    if (primitive.kind !== 'primitive') {
      continue;
    }
    for (const role of ['loader', 'params', 'method', 'computed']) {
      const requirements = primitive.details?.[`${role}Requirements`];
      if (
        !Array.isArray(requirements) ||
        !requirements.every((value) => typeof value === 'string')
      ) {
        continue;
      }
      for (const requirement of requirements) {
        const service = effectServices.get(requirement);
        if (!service) continue;
        addEdge(builder, primitive.id, service.id, 'depends-on', 'type', {
          runtime: 'effect',
          effectRequirement: true,
          resourceRole: role,
        });
      }
    }
  }
}

function collectReactiveBindings(
  builder: GraphBuilder,
  scope: Node,
  ownerId: string,
  component?: ComponentInfo,
): Map<string, ReactiveBinding> {
  const bindings = new Map<string, ReactiveBinding>();

  for (const call of scope.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!isPrimitiveFactory(call)) continue;
    const primitive = primitiveFactoryName(call);
    if (!primitive) continue;
    const primitiveNode = addPrimitiveNode(builder, call, primitive, ownerId);

    const declaration = initializerDeclaration(call);
    const declarationName = declaration?.getNameNode();
    if (declarationName && Node.isIdentifier(declarationName)) {
      bindings.set(declarationName.getText(), {
        primitiveId: primitiveNode.id,
      });
    }

    const property = initializerProperty(call);
    if (property) {
      bindings.set(property.getName(), { primitiveId: primitiveNode.id });
    }
  }

  if (component) {
    for (const [name, service] of component.bindings) {
      const primitive = findPrimitiveByName(builder, service.node.id, name);
      if (primitive) {
        bindings.set(name, { primitiveId: primitive.id, service });
        continue;
      }
      const isKnownMember =
        service.outputPropertyNames.size === 0 ||
        service.outputPropertyNames.has(name);
      if (!isKnownMember) {
        bindings.set(name, { primitiveId: service.node.id, service });
        continue;
      }
      bindings.set(name, {
        primitiveId: `property:${service.node.id}:${name}`,
        service,
      });
      addNode(builder, {
        id: `property:${service.node.id}:${name}`,
        kind: 'property',
        label: `${service.node.label}.${name}`,
        filePath: service.node.filePath,
        line: service.node.line,
        details: { member: name },
      });
      addEdge(
        builder,
        service.node.id,
        `property:${service.node.id}:${name}`,
        'contains',
        'type',
        {
          property: name,
        },
      );
    }
  }

  return bindings;
}

function analyzeReactiveDependencies(
  builder: GraphBuilder,
  scope: Node,
  bindings: Map<string, ReactiveBinding>,
  aggregateOwnerId: string,
  component?: ComponentInfo,
): void {
  for (const call of scope.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (isResourcePrimitive(call)) {
      const host = addOwnedPrimitive(builder, call, aggregateOwnerId);
      const params = resourceParamsInitializer(call);
      if (host && params) {
        addReactiveDependencyEdges(
          builder,
          host,
          collectResourceParamExpressions(params),
          bindings,
          component,
          aggregateOwnerId,
          'params',
        );
      }
    }
    if (!isTrackedReactiveHost(call)) continue;
    const host = addOwnedPrimitive(builder, call, aggregateOwnerId);
    if (!host) continue;
    const body = reactiveHostBody(call);
    if (!body) continue;
    addReactiveDependencyEdges(
      builder,
      host,
      collectReactiveExpressions(body),
      bindings,
      component,
      aggregateOwnerId,
    );
  }
}

function addReactiveDependencyEdges(
  builder: GraphBuilder,
  host: DependencyGraphNode,
  expressions: readonly Node[],
  bindings: Map<string, ReactiveBinding>,
  component: ComponentInfo | undefined,
  aggregateOwnerId: string,
  resourceRole?: 'params',
): void {
  for (const expression of expressions) {
    const target = resolveReactiveTarget(
      builder,
      expression,
      bindings,
      component,
      aggregateOwnerId,
    );
    if (!target || target.id === host.id) continue;
    addEdge(builder, host.id, target.id, target.kind, 'ast', {
      ...(resourceRole ? { resourceRole } : {}),
      ...target.details,
      ...(target.kind === 'calls'
        ? {
            callSite: {
              filePath: expression.getSourceFile().getFilePath(),
              line: expression.getStartLineNumber(),
              offset: expression.getStart(),
            },
          }
        : {}),
    });
  }
}

function isResourcePrimitive(call: CallExpression): boolean {
  const primitive = primitiveFactoryName(call);
  return (
    primitive === 'query' ||
    primitive === 'queryEffect' ||
    primitive === 'asyncProcess' ||
    primitive === 'asyncProcessEffect'
  );
}

function resourceParamsInitializer(
  call: CallExpression,
): Node | undefined {
  for (const argument of call.getArguments()) {
    const object = argument.asKind(SyntaxKind.ObjectLiteralExpression);
    const property = object?.getProperty('params');
    const initializer = property?.isKind(SyntaxKind.PropertyAssignment)
      ? property.getInitializer()
      : property?.isKind(SyntaxKind.ShorthandPropertyAssignment)
        ? property.getNameNode()
        : undefined;
    if (initializer) return initializer;
  }
  return undefined;
}

function collectResourceParamExpressions(initializer: Node): Node[] {
  const expressions = collectReactiveExpressions(initializer);
  const root = unwrapExpression(initializer);
  if (
    root &&
    (Node.isIdentifier(root) ||
      Node.isPropertyAccessExpression(root) ||
      Node.isCallExpression(root))
  ) {
    expressions.unshift(root);
  }

  const pending = [...expressions];
  const visited = new Set<Node>();
  while (pending.length > 0) {
    const expression = pending.shift();
    if (!expression) continue;
    const declaration = localFunctionDeclaration(expression);
    if (!declaration || visited.has(declaration)) continue;
    visited.add(declaration);
    const body = functionDeclarationBody(declaration);
    for (const nested of collectReactiveExpressions(body)) {
      if (expressions.includes(nested)) continue;
      expressions.push(nested);
      pending.push(nested);
    }
  }
  return expressions;
}

function localFunctionDeclaration(
  expression: Node,
): VariableDeclaration | FunctionDeclaration | undefined {
  const root = unwrapExpression(expression);
  const identifier = Node.isIdentifier(root)
    ? root
    : Node.isCallExpression(root) && Node.isIdentifier(root.getExpression())
      ? root.getExpression()
      : undefined;
  if (!identifier) return undefined;

  const symbol = identifier.getSymbol();
  for (const declaration of symbol?.getDeclarations() ?? []) {
    if (Node.isFunctionDeclaration(declaration)) return declaration;
    if (!Node.isVariableDeclaration(declaration)) continue;
    const initializer = declaration.getInitializer();
    if (
      initializer &&
      (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
    ) {
      return declaration;
    }
  }
  return undefined;
}

function functionDeclarationBody(
  declaration: VariableDeclaration | FunctionDeclaration,
): Node {
  if (Node.isFunctionDeclaration(declaration)) {
    return declaration.getBody() ?? declaration;
  }
  const initializer = declaration.getInitializer();
  return Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)
    ? initializer.getBody()
    : declaration;
}

function analyzeTemplateDependencies(
  builder: GraphBuilder,
  component: ComponentInfo,
  template: Node,
  bindings: Map<string, ReactiveBinding>,
): void {
  const parameterNames = templateParameterNames(template);
  for (const expression of collectReactiveExpressions(template)) {
    if (
      Node.isIdentifier(expression) &&
      parameterNames.has(expression.getText()) &&
      isBindingName(expression)
    ) {
      continue;
    }
    const target = resolveReactiveTarget(
      builder,
      expression,
      bindings,
      component,
      component.node.id,
    );
    if (!target) continue;
    const kind = target.kind === 'calls' ? 'calls' : 'uses-property';
    addEdge(builder, component.node.id, target.id, kind, 'ast', {
      ...target.details,
      usage: 'template',
      ...(kind === 'calls'
        ? {
            callSite: {
              filePath: expression.getSourceFile().getFilePath(),
              line: expression.getStartLineNumber(),
              offset: expression.getStart(),
            },
          }
        : {}),
    });
  }
}

function collectReactiveExpressions(scope: Node): Node[] {
  const expressions: Node[] = [];
  const seen = new Set<Node>();
  const add = (node: Node | undefined): void => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    expressions.push(node);
  };

  for (const yieldExpression of scope.getDescendantsOfKind(
    SyntaxKind.YieldExpression,
  )) {
    add(unwrapExpression(yieldExpression.getExpression()));
  }
  for (const call of scope.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (
      isPrimitiveFactory(call) ||
      findCraftHttpClientUsage(call) ||
      findCraftTemporalUsage(call)
    ) {
      continue;
    }
    add(call);
  }
  for (const access of scope.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression,
  )) {
    if (access.getParent()?.isKind(SyntaxKind.CallExpression)) continue;
    add(access);
  }
  for (const identifier of scope.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (isBindingName(identifier)) continue;
    if (identifier.getParent()?.isKind(SyntaxKind.PropertyAccessExpression))
      continue;
    if (identifier.getParent()?.isKind(SyntaxKind.CallExpression)) continue;
    add(identifier);
  }
  return expressions;
}

function resolveReactiveTarget(
  builder: GraphBuilder,
  expression: Node | undefined,
  bindings: Map<string, ReactiveBinding>,
  component: ComponentInfo | undefined,
  aggregateOwnerId: string,
):
  | {
      id: string;
      kind: 'depends-on' | 'calls';
      details?: Record<string, unknown>;
    }
  | undefined {
  const unwrapped = unwrapExpression(expression);
  if (!unwrapped) return undefined;

  if (Node.isCallExpression(unwrapped)) {
    const callee = unwrapped.getExpression();
    const wrapperName = Node.isIdentifier(callee)
      ? callee.getText()
      : undefined;
    if (wrapperName && REACTIVE_WRAPPER_NAMES.has(wrapperName)) {
      return resolveReactiveTarget(
        builder,
        unwrapped.getArguments()[0],
        bindings,
        component,
        aggregateOwnerId,
      );
    }
    const chain = Node.isIdentifier(callee)
      ? [callee.getText()]
      : Node.isPropertyAccessExpression(callee)
        ? propertyAccessChain(callee)
        : undefined;
    if (!chain) return undefined;
    return resolveReactiveChain(
      builder,
      chain,
      unwrapped,
      bindings,
      component,
      aggregateOwnerId,
    );
  }

  if (Node.isIdentifier(unwrapped)) {
    return resolveReactiveChain(
      builder,
      [unwrapped.getText()],
      unwrapped,
      bindings,
      component,
      aggregateOwnerId,
    );
  }

  if (Node.isPropertyAccessExpression(unwrapped)) {
    const chain = propertyAccessChain(unwrapped);
    if (!chain) return undefined;
    return resolveReactiveChain(
      builder,
      chain,
      unwrapped,
      bindings,
      component,
      aggregateOwnerId,
    );
  }

  return undefined;
}

function resolveReactiveChain(
  builder: GraphBuilder,
  chain: string[],
  node: Node,
  bindings: Map<string, ReactiveBinding>,
  component: ComponentInfo | undefined,
  aggregateOwnerId: string,
):
  | {
      id: string;
      kind: 'depends-on' | 'calls';
      details?: Record<string, unknown>;
    }
  | undefined {
  const [root, ...rest] = chain;
  if (!root) return undefined;
  if (INSERTION_CONTEXT_NAMES.has(root)) {
    const enclosing = enclosingPrimitiveNode(builder, node, aggregateOwnerId);
    if (enclosing) {
      if (rest.length === 0) {
        return {
          id: enclosing.id,
          kind: isLikelyMethod(rest, node, builder, enclosing.id)
            ? 'calls'
            : 'depends-on',
          details: { reader: root },
        };
      }
      const propertyNode = addPrimitiveMemberProperty(
        builder,
        enclosing.id,
        rest.join('.'),
        node,
      );
      return {
        id: propertyNode.id,
        kind: isLikelyMethod(rest, node, builder, enclosing.id)
          ? 'calls'
          : 'depends-on',
        details: { path: rest.join('.') },
      };
    }
  }
  const binding = bindings.get(root);
  const service = binding?.service ?? component?.bindings.get(root);
  const method = isLikelyMethod(rest, node, builder, binding?.primitiveId);

  if (binding?.primitiveId && builder.nodes.has(binding.primitiveId)) {
    if (rest.length === 0) {
      const primitive = builder.nodes.get(binding.primitiveId);
      const isMethod =
        method || primitive?.details?.['primitive'] === 'craftMethod';
      return {
        id: binding.primitiveId,
        kind: isMethod ? 'calls' : 'depends-on',
        details: { reader: root },
      };
    }
    const memberPrimitive = INSERTION_CONTEXT_NAMES.has(root)
      ? undefined
      : findMemberPrimitive(builder, binding.primitiveId, rest[0]);
    if (memberPrimitive) {
      if (rest.length === 1) {
        return {
          id: memberPrimitive.id,
          kind: method ? 'calls' : 'depends-on',
          details: { path: rest.join('.') },
        };
      }
      const propertyNode = addPrimitiveMemberProperty(
        builder,
        memberPrimitive.id,
        rest.slice(1).join('.'),
        node,
      );
      return {
        id: propertyNode.id,
        kind: method ? 'calls' : 'depends-on',
        details: { path: rest.join('.') },
      };
    }
    const propertyNode = addPrimitiveMemberProperty(
      builder,
      binding.primitiveId,
      rest.join('.'),
      node,
    );
    return {
      id: propertyNode.id,
      kind: method ? 'calls' : 'depends-on',
      details: { path: rest.join('.') },
    };
  }

  if (service) {
    if (rest.length === 0) {
      const primitive = findPrimitiveByName(builder, service.node.id, root);
      if (primitive) {
        return { id: primitive.id, kind: method ? 'calls' : 'depends-on' };
      }
      const propertyNode = addServiceMemberProperty(
        builder,
        service,
        root,
        node,
      );
      return { id: propertyNode.id, kind: method ? 'calls' : 'depends-on' };
    }
    const outputPrimitive = findPrimitiveByName(
      builder,
      service.node.id,
      rest[0],
    );
    if (outputPrimitive) {
      if (rest.length === 1) {
        return {
          id: outputPrimitive.id,
          kind: method ? 'calls' : 'depends-on',
          details: { path: rest.join('.') },
        };
      }
      const nestedOutputProperty = addPrimitiveMemberProperty(
        builder,
        outputPrimitive.id,
        rest.slice(1).join('.'),
        node,
      );
      return {
        id: nestedOutputProperty.id,
        kind: method ? 'calls' : 'depends-on',
        details: { path: rest.join('.') },
      };
    }
    const rootPrimitive = findPrimitiveByName(builder, service.node.id, root);
    if (rootPrimitive) {
      const primitiveMethod = isLikelyMethod(
        rest,
        node,
        builder,
        rootPrimitive.id,
      );
      const memberPrimitive = findMemberPrimitive(
        builder,
        rootPrimitive.id,
        rest[0],
      );
      if (memberPrimitive) {
        if (rest.length === 1) {
          return {
            id: memberPrimitive.id,
            kind: primitiveMethod ? 'calls' : 'depends-on',
            details: { path: rest.join('.') },
          };
        }
        const nestedProperty = addPrimitiveMemberProperty(
          builder,
          memberPrimitive.id,
          rest.slice(1).join('.'),
          node,
        );
        return {
          id: nestedProperty.id,
          kind: primitiveMethod ? 'calls' : 'depends-on',
          details: { path: rest.join('.') },
        };
      }
      const propertyNode = addPrimitiveMemberProperty(
        builder,
        rootPrimitive.id,
        rest.join('.'),
        node,
      );
      return {
        id: propertyNode.id,
        kind: primitiveMethod ? 'calls' : 'depends-on',
        details: { path: rest.join('.') },
      };
    }
    const propertyNode = addServiceMemberProperty(
      builder,
      service,
      rest.join('.'),
      node,
    );
    return {
      id: propertyNode.id,
      kind: method ? 'calls' : 'depends-on',
      details: { path: rest.join('.') },
    };
  }

  return undefined;
}

function addPrimitiveMemberProperty(
  builder: GraphBuilder,
  primitiveId: string,
  memberPath: string,
  node: Node,
): DependencyGraphNode {
  const primitive = builder.nodes.get(primitiveId);
  const member = memberPath.split('.')[0] ?? memberPath;
  const exposedMethods = readStringArray(
    primitive?.details?.['exposedMethods'],
  );
  const propertyNode = addNode(builder, {
    id: `property:${primitiveId}:${memberPath}`,
    kind: 'property',
    label: `${primitive?.label ?? primitiveId}.${memberPath}`,
    filePath: node.getSourceFile().getFilePath(),
    line: node.getStartLineNumber(),
    details: {
      member: memberPath,
      ...(exposedMethods.includes(member) ? { exposedMethod: true } : {}),
    },
  });
  addEdge(builder, primitiveId, propertyNode.id, 'contains', 'ast', {
    property: memberPath.split('.')[0],
  });
  return propertyNode;
}

function addServiceMemberProperty(
  builder: GraphBuilder,
  service: ServiceInfo,
  memberPath: string,
  node: Node,
): DependencyGraphNode {
  const propertyNode = addNode(builder, {
    id: `property:${service.node.id}:${memberPath}`,
    kind: 'property',
    label: `${service.node.label}.${memberPath}`,
    filePath: service.node.filePath,
    line: node.getStartLineNumber(),
    details: { member: memberPath },
  });
  addEdge(builder, service.node.id, propertyNode.id, 'contains', 'type', {
    member: memberPath,
  });
  return propertyNode;
}

function enclosingPrimitiveNode(
  builder: GraphBuilder,
  node: Node,
  aggregateOwnerId: string,
): DependencyGraphNode | undefined {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isCallExpression(current) && isPrimitiveFactory(current)) {
      const primitive = primitiveFactoryName(current);
      if (
        primitive &&
        primitive !== 'craftComputed' &&
        primitive !== 'craftMethod' &&
        primitive !== 'craftEffect'
      ) {
        return addPrimitiveNode(builder, current, primitive, aggregateOwnerId);
      }
    }
    current = current.getParent();
  }
  return undefined;
}

function findPrimitiveByName(
  builder: GraphBuilder,
  ownerId: string,
  name: string,
): DependencyGraphNode | undefined {
  return [...builder.nodes.values()].find(
    (node) =>
      node.kind === 'primitive' &&
      node.details?.['ownerId'] === ownerId &&
      node.details?.['name'] === name,
  );
}

function findMemberPrimitive(
  builder: GraphBuilder,
  parentPrimitiveId: string,
  memberName: string,
): DependencyGraphNode | undefined {
  for (const edge of builder.edges.values()) {
    if (edge.kind !== 'contains' || edge.from !== parentPrimitiveId) continue;
    const child = builder.nodes.get(edge.to);
    if (
      child?.kind === 'primitive' &&
      (child.details?.['usage'] === memberName ||
        child.details?.['name'] === memberName)
    ) {
      return child;
    }
  }
  return undefined;
}

function isLikelyMethod(
  path: string[],
  node: Node,
  builder: GraphBuilder,
  primitiveId?: string,
): boolean {
  const leaf = path[path.length - 1];
  if (leaf && REACTIVE_METHOD_NAMES.has(leaf)) return true;
  if (leaf && REACTIVE_READER_NAMES.has(leaf)) return false;
  if (primitiveId) {
    if (
      leaf &&
      readStringArray(builder.nodes.get(primitiveId)?.details?.['exposedMethods']).includes(leaf)
    ) {
      return true;
    }
    const member = leaf
      ? findMemberPrimitive(builder, primitiveId, leaf)
      : undefined;
    if (member?.details?.['primitive'] === 'craftMethod') return true;
  }
  return (
    Node.isCallExpression(node) &&
    node.getArguments().length > 0 &&
    !REACTIVE_READER_NAMES.has(leaf ?? '')
  );
}

function isTrackedReactiveHost(call: CallExpression): boolean {
  const name = primitiveFactoryName(call);
  return (
    name === 'craftComputed' || name === 'craftMethod' || name === 'craftEffect'
  );
}

function reactiveHostBody(call: CallExpression): Node | undefined {
  return (
    call
      .getArguments()
      .find(
        (argument) =>
          argument.isKind(SyntaxKind.ArrowFunction) ||
          argument.isKind(SyntaxKind.FunctionExpression),
      ) ?? call.getArguments().at(-1)
  );
}

function initializerDeclaration(
  call: CallExpression,
): VariableDeclaration | undefined {
  const yieldExpression = call.getFirstAncestorByKind(
    SyntaxKind.YieldExpression,
  );
  const declaration = (yieldExpression ?? call).getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  if (!declaration) return undefined;
  const initializer = unwrapExpression(declaration.getInitializer());
  if (initializer === call) return declaration;
  if (
    initializer?.isKind(SyntaxKind.YieldExpression) &&
    unwrapExpression(initializer.getExpression()) === call
  ) {
    return declaration;
  }
  return undefined;
}

function initializerProperty(
  call: CallExpression,
): import('ts-morph').PropertyAssignment | undefined {
  const property = call.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
  if (!property) return undefined;
  const initializer = unwrapExpression(property.getInitializer());
  return initializer === call ? property : undefined;
}

function templateParameterNames(template: Node): Set<string> {
  if (
    !template.isKind(SyntaxKind.ArrowFunction) &&
    !template.isKind(SyntaxKind.FunctionExpression)
  ) {
    return new Set();
  }
  const parameter = template.getParameters()[0]?.getNameNode();
  return new Set(parameter ? getBindingNames(parameter) : []);
}

function isBindingName(identifier: import('ts-morph').Identifier): boolean {
  const parent = identifier.getParent();
  return (
    parent?.isKind(SyntaxKind.BindingElement) === true ||
    parent?.isKind(SyntaxKind.Parameter) === true ||
    parent?.isKind(SyntaxKind.VariableDeclaration) === true
  );
}

function unwrapExpression(node: Node | undefined): Node | undefined {
  let current = node;
  while (current && Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

function addPrimitiveNode(
  builder: GraphBuilder,
  call: CallExpression,
  primitive: string,
  ownerId: string,
): DependencyGraphNode {
  const name = getStringArgument(call, 0) ?? primitive;
  const usage = primitiveUsageName(call);
  return addNode(builder, {
    id: `primitive:${call.getSourceFile().getFilePath()}:${primitive}:${call.getStartLineNumber()}`,
    kind: 'primitive',
    label: `${primitive}:${name}`,
    filePath: call.getSourceFile().getFilePath(),
    line: call.getStartLineNumber(),
    details: {
      primitive,
      name,
      ownerId,
      ...(usage ? { usage } : {}),
    },
  });
}

function addHttpClientUsage(
  builder: GraphBuilder,
  nodeId: string,
  usage: CraftHttpClientUsage,
  edgeDetails: Record<string, unknown> = {},
): void {
  const node = builder.nodes.get(nodeId);
  if (!node) return;
  node.details = {
    ...(node.details ?? {}),
    craftHttpClient: true,
    httpEndpoints: mergeHttpEndpoints(node.details?.['httpEndpoints'], usage),
  };
  const endpointId = `http-endpoint:${usage.method}:${usage.url}`;
  const relativeFile = node.filePath
    ? relative(builder.rootDir, node.filePath).split('\\').join('/')
    : undefined;
  const endpoint = addNode(builder, {
    id: endpointId,
    kind: 'http-endpoint',
    label: `${usage.method} ${usage.url}`,
    filePath: node.filePath,
    line: usage.line,
    details: {
      method: usage.method,
      url: usage.url,
      callSites: [],
    },
  });
  const callSites = Array.isArray(endpoint.details?.['callSites'])
    ? [...(endpoint.details['callSites'] as DependencyGraphHttpCallSite[])]
    : [];
  if (
    !callSites.some(
      (site) => site.ownerId === nodeId && site.line === usage.line,
    )
  ) {
    callSites.push({
      ownerId: nodeId,
      line: usage.line,
      ...(relativeFile ? { filePath: relativeFile } : {}),
    });
  }
  endpoint.details = {
    ...(endpoint.details ?? {}),
    method: usage.method,
    url: usage.url,
    callSites,
  };
  addEdge(builder, nodeId, endpoint.id, 'calls', 'ast', {
    http: true,
    method: usage.method,
    url: usage.url,
    line: usage.line,
    ...edgeDetails,
  });
}

/**
 * Returns the resource factory whose `loader` property contains a call.
 * Keeping this fact on the edge lets architecture rules distinguish a real
 * loader dependency from an HTTP call made by params or an insertion.
 */
function resourceLoaderFactory(call: Node): CallExpression | undefined {
  let current: Node | undefined = call;
  while (current) {
    if (Node.isPropertyAssignment(current) && current.getName() === 'loader') {
      let parent: Node | undefined = current.getParent();
      while (parent) {
        if (Node.isCallExpression(parent)) {
          const primitive = primitiveFactoryName(parent);
          if (
            primitive === 'query' ||
            primitive === 'mutation' ||
            primitive === 'queryEffect' ||
            primitive === 'mutationEffect'
          ) {
            return parent;
          }
        }
        parent = parent.getParent();
      }
    }
    current = current.getParent();
  }
  return undefined;
}

function addServerFunctionUsage(
  builder: GraphBuilder,
  call: CallExpression,
  aggregateOwnerId: string,
): void {
  const family = serverFunctionFamilyForCall(builder, call);
  if (!family) return;
  const owner = ownerNodeForCall(builder, call, aggregateOwnerId);
  addEdge(builder, owner.id, family.id, 'calls', 'type', {
    serverFunction: true,
    ...(resourceLoaderFactory(call) ? { resourceRole: 'loader' } : {}),
    line: call.getStartLineNumber(),
  });
}

function serverFunctionFamilyForCall(
  builder: GraphBuilder,
  call: CallExpression,
): DependencyGraphNode | undefined {
  const identifier = rootIdentifier(call.getExpression());
  const symbol = identifier?.getSymbol();
  const resolved = symbol?.getAliasedSymbol() ?? symbol;
  for (const declaration of resolved?.getDeclarations() ?? []) {
    const filePath = declaration.getSourceFile().getFilePath();
    if (!filePath.endsWith('.fn-client.ts')) continue;
    const familyPath = filePath.slice(0, -'.fn-client.ts'.length);
    return builder.nodes.get(`server-function-family:${familyPath}`);
  }
  return undefined;
}

type DependencyGraphUniqueCallSite = {
  ownerId?: string;
  filePath: string;
  line: number;
};

function addCraftUniqueUsage(
  builder: GraphBuilder,
  call: CallExpression,
): void {
  const sourceFile = call.getSourceFile();
  const filePath = relative(builder.rootDir, sourceFile.getFilePath())
    .split('\\')
    .join('/');
  const line = call.getStartLineNumber();
  const ownerId = findCraftUniqueOwnerId(builder, call);
  const canonicalized = canonicalizeStaticValue(call.getArguments()[0]);
  const id = canonicalized.static
    ? `unique:${createHash('sha256').update(canonicalized.canonical).digest('hex').slice(0, 16)}`
    : `unique:non-static:${sourceFile.getFilePath()}:${line}`;
  const label = canonicalized.static
    ? canonicalized.canonical
    : 'craftUnique(non-static)';
  const node = addNode(builder, {
    id,
    kind: 'unique',
    label,
    filePath: sourceFile.getFilePath(),
    line,
    details: {
      static: canonicalized.static,
      ...(canonicalized.static ? { canonical: canonicalized.canonical } : {}),
      callSites: [],
    },
  });
  const callSites = Array.isArray(node.details?.['callSites'])
    ? [...(node.details['callSites'] as DependencyGraphUniqueCallSite[])]
    : [];
  if (
    !callSites.some(
      (site) =>
        site.filePath === filePath &&
        site.line === line &&
        site.ownerId === ownerId,
    )
  ) {
    callSites.push({ filePath, line, ...(ownerId ? { ownerId } : {}) });
  }
  node.details = {
    ...(node.details ?? {}),
    static: canonicalized.static,
    ...(canonicalized.static ? { canonical: canonicalized.canonical } : {}),
    callSites,
  };
  if (ownerId) {
    addEdge(builder, ownerId, node.id, 'calls', 'ast', {
      unique: true,
      line,
    });
  }
}

function findCraftUniqueOwnerId(
  builder: GraphBuilder,
  call: CallExpression,
): string | undefined {
  const enclosing = nearestPrimitiveFactory(call);
  const primitive = enclosing && primitiveFactoryName(enclosing);
  if (enclosing && primitive) {
    const id = `primitive:${enclosing.getSourceFile().getFilePath()}:${primitive}:${enclosing.getStartLineNumber()}`;
    if (builder.nodes.has(id)) return id;
  }
  let current: Node | undefined = call.getParent();
  while (current) {
    if (Node.isCallExpression(current)) {
      const service = builder.services.find((item) => item.call === current);
      if (service) return service.node.id;
      const component = builder.components.find(
        (item) => item.call === current,
      );
      if (component) return component.node.id;
    }
    current = current.getParent();
  }
  return undefined;
}

type CanonicalStaticValue =
  | { static: true; canonical: string }
  | { static: false };

function canonicalizeStaticValue(node: Node | undefined): CanonicalStaticValue {
  const value = staticLiteralValue(node);
  if (value === undefined) return { static: false };
  return { static: true, canonical: JSON.stringify(sortKeysDeep(value)) };
}

function staticLiteralValue(node: Node | undefined): unknown | undefined {
  const current = unwrapStaticExpression(node);
  if (!current) return undefined;
  if (
    Node.isStringLiteral(current) ||
    Node.isNoSubstitutionTemplateLiteral(current)
  ) {
    return current.getLiteralValue();
  }
  if (Node.isNumericLiteral(current)) {
    return Number(current.getLiteralValue());
  }
  if (current.getKind() === SyntaxKind.TrueKeyword) return true;
  if (current.getKind() === SyntaxKind.FalseKeyword) return false;
  if (current.getKind() === SyntaxKind.NullKeyword) return null;
  if (Node.isPrefixUnaryExpression(current)) {
    const operand = staticLiteralValue(current.getOperand());
    if (typeof operand !== 'number') return undefined;
    if (current.getOperatorToken() === SyntaxKind.MinusToken) return -operand;
    if (current.getOperatorToken() === SyntaxKind.PlusToken) return operand;
    return undefined;
  }
  if (Node.isArrayLiteralExpression(current)) {
    const items: unknown[] = [];
    for (const element of current.getElements()) {
      if (Node.isSpreadElement(element)) return undefined;
      const value = staticLiteralValue(element);
      if (value === undefined) return undefined;
      items.push(value);
    }
    return items;
  }
  if (Node.isObjectLiteralExpression(current)) {
    const record: Record<string, unknown> = {};
    for (const property of current.getProperties()) {
      if (!Node.isPropertyAssignment(property)) return undefined;
      const key = staticPropertyName(property);
      if (key === undefined) return undefined;
      const value = staticLiteralValue(property.getInitializer());
      if (value === undefined) return undefined;
      record[key] = value;
    }
    return record;
  }
  return undefined;
}

function staticPropertyName(
  property: import('ts-morph').PropertyAssignment,
): string | undefined {
  const nameNode = property.getNameNode();
  if (Node.isIdentifier(nameNode)) return nameNode.getText();
  if (
    Node.isStringLiteral(nameNode) ||
    Node.isNoSubstitutionTemplateLiteral(nameNode)
  ) {
    return nameNode.getLiteralValue();
  }
  if (Node.isNumericLiteral(nameNode))
    return String(nameNode.getLiteralValue());
  if (Node.isComputedPropertyName(nameNode)) {
    const value = staticLiteralValue(nameNode.getExpression());
    if (typeof value === 'string' || typeof value === 'number')
      return String(value);
  }
  return undefined;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key]);
    }
    return sorted;
  }
  return value;
}

function unwrapStaticExpression(node: Node | undefined): Node | undefined {
  let current = node;
  while (current) {
    if (Node.isParenthesizedExpression(current)) {
      current = current.getExpression();
      continue;
    }
    if (Node.isAsExpression(current) || Node.isSatisfiesExpression(current)) {
      current = current.getExpression();
      continue;
    }
    if (Node.isTypeAssertion(current)) {
      current = current.getExpression();
      continue;
    }
    break;
  }
  return current;
}

type DependencyGraphHttpCallSite = {
  ownerId: string;
  line: number;
  filePath?: string;
};

function addTemporalUsage(
  builder: GraphBuilder,
  nodeId: string,
  usage: CraftTemporalUsage,
): void {
  const node = builder.nodes.get(nodeId);
  if (!node) return;
  const previous = Array.isArray(node.details?.['temporalOperations'])
    ? node.details['temporalOperations'].filter(isTemporalOperation)
    : [];
  if (
    !previous.some(
      (operation) =>
        operation.operation === usage.operation &&
        operation.delay === usage.delay &&
        operation.line === usage.line,
    )
  ) {
    previous.push(usage);
  }
  node.details = {
    ...(node.details ?? {}),
    temporal: true,
    temporalOperations: previous.sort((left, right) => left.line - right.line),
  };
}

function mergeHttpEndpoints(
  previous: unknown,
  next: CraftHttpClientUsage,
): CraftHttpClientUsage[] {
  const endpoints = Array.isArray(previous)
    ? previous.filter(isHttpEndpoint)
    : [];
  if (
    !endpoints.some(
      (endpoint) =>
        endpoint.method === next.method &&
        endpoint.url === next.url &&
        endpoint.line === next.line,
    )
  ) {
    endpoints.push(next);
  }
  return endpoints.sort((left, right) => left.line - right.line);
}

function isHttpEndpoint(value: unknown): value is CraftHttpClientUsage {
  if (!value || typeof value !== 'object') return false;
  const endpoint = value as Record<string, unknown>;
  return (
    typeof endpoint['method'] === 'string' &&
    typeof endpoint['url'] === 'string' &&
    typeof endpoint['line'] === 'number'
  );
}

function isTemporalOperation(value: unknown): value is CraftTemporalUsage {
  if (!value || typeof value !== 'object') return false;
  const operation = value as Record<string, unknown>;
  return (
    typeof operation['operation'] === 'string' &&
    typeof operation['line'] === 'number' &&
    (operation['delay'] === undefined || typeof operation['delay'] === 'string')
  );
}

function findCraftTemporalUsage(
  call: CallExpression,
): CraftTemporalUsage | undefined {
  const expression = call.getExpression();
  const root = rootIdentifier(expression)?.getText();
  const methodName = Node.isPropertyAccessExpression(expression)
    ? expression.getName()
    : undefined;
  const operation =
    (root && CRAFT_TEMPORAL_FUNCTIONS.has(root) && root) ||
    (methodName &&
    CRAFT_TEMPORAL_RUNTIME_METHODS.has(methodName) &&
    /(?:temporal|scheduler|clock|timer)/i.test(root ?? '')
      ? methodName
      : undefined);
  if (!operation) return undefined;

  const delayArgument =
    operation === 'setTimeout' || operation === 'setInterval'
      ? call.getArguments()[1]
      : operation === 'craftSleep' || operation === 'sleep'
        ? call.getArguments()[0]
        : undefined;
  return {
    operation,
    ...(delayArgument ? { delay: delayArgument.getText() } : {}),
    line: call.getStartLineNumber(),
  };
}

function findCraftHttpClientUsage(
  call: CallExpression,
): CraftHttpClientUsage | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  const root = rootIdentifier(expression)?.getText();
  if (root !== 'CraftHttpClient' && root !== 'craftHttpClient')
    return undefined;

  const methodName = expression.getName();
  if (!CRAFT_HTTP_CLIENT_METHODS.has(methodName)) return undefined;

  const config = getHttpClientConfig(call);
  const url =
    getStaticExpressionText(
      config
        ?.getProperty('url')
        ?.asKind(SyntaxKind.PropertyAssignment)
        ?.getInitializer(),
    ) ?? getStringArgument(call, 0);
  if (!url) return undefined;

  const configuredMethod = getStaticExpressionText(
    config
      ?.getProperty('method')
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer(),
  );
  return {
    method: (configuredMethod ?? methodName).toUpperCase(),
    url,
    line: call.getStartLineNumber(),
  };
}

function getHttpClientConfig(
  call: CallExpression,
): ObjectLiteralExpression | undefined {
  const firstArgument = call.getArguments()[0];
  const directConfig = firstArgument?.asKind(
    SyntaxKind.ObjectLiteralExpression,
  );
  if (directConfig) return directConfig;
  if (
    firstArgument?.isKind(SyntaxKind.ArrowFunction) ||
    firstArgument?.isKind(SyntaxKind.FunctionExpression)
  ) {
    let body = firstArgument.getBody();
    if (Node.isParenthesizedExpression(body)) body = body.getExpression();
    const returnedConfig = body.asKind(SyntaxKind.ObjectLiteralExpression);
    if (returnedConfig) return returnedConfig;
    return body
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .map((statement) =>
        statement.getExpression()?.asKind(SyntaxKind.ObjectLiteralExpression),
      )
      .find((value): value is ObjectLiteralExpression => value !== undefined);
  }
  return undefined;
}

function getStaticExpressionText(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  if (Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralValue();
  const text = node.getText().trim();
  return text.length > 0 ? text : undefined;
}

function primitiveUsageName(call: CallExpression): string | undefined {
  const property = initializerProperty(call);
  if (property) return property.getName();

  const declaration = initializerDeclaration(call);
  const declarationName = declaration?.getNameNode();
  if (declarationName && Node.isIdentifier(declarationName)) {
    return declarationName.getText();
  }

  const callableProperty = call.getAncestors().find((ancestor) => {
    if (!Node.isPropertyAssignment(ancestor)) return false;
    const initializer = ancestor.getInitializer();
    return Boolean(
      initializer?.isKind(SyntaxKind.ArrowFunction) ||
        initializer?.isKind(SyntaxKind.FunctionExpression),
    );
  });
  if (callableProperty && Node.isPropertyAssignment(callableProperty)) {
    return callableProperty.getName();
  }

  return undefined;
}

function addServiceDependency(
  builder: GraphBuilder,
  aggregateOwnerId: string,
  service: ServiceInfo,
  call: CallExpression,
): void {
  const ownerPrimitive = nearestPrimitiveFactory(call);
  const ownerPrimitiveName =
    ownerPrimitive && primitiveFactoryName(ownerPrimitive);
  const ownerNode =
    ownerPrimitive && ownerPrimitiveName
      ? addPrimitiveNode(
          builder,
          ownerPrimitive,
          ownerPrimitiveName,
          aggregateOwnerId,
        )
      : undefined;
  const dependencyOwnerId = ownerNode?.id ?? aggregateOwnerId;
  const memberAccess = call
    .getExpression()
    .asKind(SyntaxKind.PropertyAccessExpression);
  const memberPath = memberAccess
    ? propertyAccessChain(memberAccess)?.slice(1).join('.')
    : undefined;
  if (memberAccess && memberPath) {
    const memberNode = addNode(builder, {
      id: `property:${service.node.id}:${memberPath}`,
      kind: 'property',
      label: `${service.node.label}.${memberPath}`,
      filePath: service.node.filePath,
      line: service.node.line,
      details: {
        member: memberPath,
        access: 'call',
        usedAt: memberAccess.getSourceFile().getFilePath(),
        usedAtLine: memberAccess.getStartLineNumber(),
        type: memberAccess.getType().getText(memberAccess),
      },
    });
    addEdge(builder, service.node.id, memberNode.id, 'contains', 'type', {
      member: memberPath,
    });
    addEdge(builder, dependencyOwnerId, service.node.id, 'depends-on', 'type', {
      member: memberPath,
      access: 'call',
      ...(resourceLoaderFactory(call) ? { resourceRole: 'loader' } : {}),
    });
    addEdge(builder, dependencyOwnerId, memberNode.id, 'depends-on', 'type', {
      member: memberPath,
      access: 'call',
      ...(resourceLoaderFactory(call) ? { resourceRole: 'loader' } : {}),
    });
    return;
  }
  addEdge(builder, dependencyOwnerId, service.node.id, 'depends-on', 'type', {
    ...(resourceLoaderFactory(call) ? { resourceRole: 'loader' } : {}),
  });
}

function nearestPrimitiveFactory(node: Node): CallExpression | undefined {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isCallExpression(current) && isPrimitiveFactory(current))
      return current;
    current = current.getParent();
  }
  return undefined;
}

function isPrimitiveFactory(call: CallExpression): boolean {
  return primitiveFactoryName(call) !== undefined;
}

function primitiveFactoryName(call: CallExpression): string | undefined {
  const name = call.getExpression().getText();
  if (!PRIMITIVES.has(name)) return undefined;
  if (
    name === 'craftComputed' ||
    name === 'craftEffect' ||
    name === 'craftMethod' ||
    name === 'insertSelect'
  ) {
    return name;
  }
  return call.getArguments().length > 0 ? name : undefined;
}

function primitiveName(call: CallExpression): string | undefined {
  const name = call.getExpression().getText();
  return PRIMITIVES.has(name) ? name : undefined;
}

function getServiceHelperOutputType(type: import('ts-morph').Type | undefined) {
  const signature = type?.getCallSignatures()[0];
  const returnType = signature?.getReturnType();
  const typeArguments = returnType?.getTypeArguments();
  return typeArguments && typeArguments.length >= 2
    ? typeArguments[1]
    : undefined;
}

function findServiceForCall(
  builder: GraphBuilder,
  call: CallExpression,
): ServiceInfo | undefined {
  const expression = call.getExpression();
  const identifier = rootIdentifier(expression);
  const helperName = identifier?.getText() ?? expression.getText();
  const symbol = identifier?.getSymbol();
  const key = symbolKey(symbol);
  const bySymbol = key ? builder.serviceByHelperKey.get(key) : undefined;
  if (bySymbol) return bySymbol;
  const byName = builder.servicesByHelperName.get(helperName) ?? [];
  return byName.length === 1 ? byName[0] : undefined;
}

function rootIdentifier(node: Node): import('ts-morph').Identifier | undefined {
  let current = node;
  while (Node.isPropertyAccessExpression(current)) {
    current = current.getExpression();
  }
  return Node.isIdentifier(current) ? current : undefined;
}

function findComponentForCall(
  builder: GraphBuilder,
  call: CallExpression,
): ComponentInfo | undefined {
  const expression = call.getExpression();
  if (!Node.isIdentifier(expression)) return undefined;
  const key = symbolKey(expression.getSymbol());
  if (key) return builder.componentByVariableKey.get(key);
  const byName =
    builder.componentsByVariableName.get(expression.getText()) ?? [];
  return byName.length === 1 ? byName[0] : undefined;
}

function findComponentForExpression(
  builder: GraphBuilder,
  node: Node | undefined,
): ComponentInfo | undefined {
  const expression = unwrapExpression(node);
  if (!expression || !Node.isIdentifier(expression)) return undefined;
  const key = symbolKey(expression.getSymbol());
  if (key) return builder.componentByVariableKey.get(key);
  const byName =
    builder.componentsByVariableName.get(expression.getText()) ?? [];
  return byName.length === 1 ? byName[0] : undefined;
}

function findComponentBoundService(
  component: ComponentInfo,
  call: CallExpression,
): ServiceInfo | undefined {
  const identifier = rootIdentifier(call.getExpression());
  return identifier ? component.bindings.get(identifier.getText()) : undefined;
}

function findBindingElement(
  node: Node | undefined,
  helperName: string,
): import('ts-morph').BindingElement | undefined {
  if (!node || !Node.isObjectBindingPattern(node)) return undefined;
  return node.getElements().find((element) => {
    if (!Node.isBindingElement(element)) return false;
    return (
      element.getNameNode().getText() === helperName ||
      element.getPropertyNameNode()?.getText() === helperName
    );
  });
}

function findBindingNameNode(
  node: Node | undefined,
  name: string,
): Node | undefined {
  if (!node) return undefined;
  if (Node.isIdentifier(node))
    return node.getText() === name ? node : undefined;
  if (!Node.isObjectBindingPattern(node) && !Node.isArrayBindingPattern(node)) {
    return undefined;
  }
  for (const element of node.getElements()) {
    if (!Node.isBindingElement(element)) continue;
    const match = findBindingNameNode(element.getNameNode(), name);
    if (match) return match;
  }
  return undefined;
}

function symbolKey(
  symbol: import('ts-morph').Symbol | undefined,
): string | undefined {
  if (!symbol) return undefined;
  const resolved = symbol.getAliasedSymbol() ?? symbol;
  const declaration =
    resolved.getDeclarations()[0] ?? symbol.getDeclarations()[0];
  return declaration
    ? `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`
    : `symbol:${resolved.getFullyQualifiedName()}`;
}

function propertyAccessChain(
  access: PropertyAccessExpression,
): string[] | undefined {
  const parts: string[] = [access.getName()];
  let expression = access.getExpression();
  while (Node.isPropertyAccessExpression(expression)) {
    parts.unshift(expression.getName());
    expression = expression.getExpression();
  }
  return Node.isIdentifier(expression)
    ? [expression.getText(), ...parts]
    : undefined;
}

function findDynamicImportSpecifiers(node: Node): string[] {
  return node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getText() === 'import')
    .map((call) => getStringArgument(call, 0))
    .filter((value): value is string => value !== undefined);
}

function findDynamicImportExportNames(
  node: Node,
  specifier: string,
): string[] | undefined {
  const importCall = node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find(
      (call) =>
        call.getExpression().getText() === 'import' &&
        getStringArgument(call, 0) === specifier,
    );
  if (!importCall) return undefined;

  let current: Node = importCall;
  for (let depth = 0; depth < 8; depth += 1) {
    const parent = current.getParent();
    if (!parent) return undefined;
    if (
      Node.isCallExpression(parent) &&
      parent.getExpression().getText() === 'withRetry'
    ) {
      current = parent;
      continue;
    }
    if (
      Node.isPropertyAccessExpression(parent) &&
      parent.getName() === 'then'
    ) {
      const thenCall = parent.getParent();
      return thenCall && Node.isCallExpression(thenCall)
        ? extractDynamicImportExportNames(thenCall)
        : undefined;
    }
    return undefined;
  }
  return undefined;
}

function extractDynamicImportExportNames(call: CallExpression): string[] | undefined {
  const callback = call.getArguments()[0];
  if (!callback || (!Node.isArrowFunction(callback) && !Node.isFunctionExpression(callback))) {
    return undefined;
  }
  const parameter = callback.getParameters()[0];
  const body = callback.getBody();
  if (!parameter || !body || !Node.isExpression(body)) return undefined;

  const bindingPattern = parameter.getNameNode();
  if (Node.isObjectBindingPattern(bindingPattern) && Node.isIdentifier(body)) {
    const binding = bindingPattern.getElements().find(
      (element) =>
        Node.isBindingElement(element) &&
        element.getNameNode().getText() === body.getText(),
    );
    if (binding && Node.isBindingElement(binding)) {
      return [binding.getPropertyNameNode()?.getText() ?? body.getText()];
    }
  }

  if (Node.isPropertyAccessExpression(body)) {
    const root = rootIdentifier(body.getExpression());
    if (root && root.getText() === parameter.getName()) {
      return [body.getName()];
    }
  }
  return undefined;
}

function componentExportNames(component: ComponentInfo): string[] {
  const declaration = component.call.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  if (!declaration) return [];
  return [...component.call.getSourceFile().getExportedDeclarations()]
    .filter(([, declarations]) =>
      declarations.some(
        (candidate) => candidate.getStart() === declaration.getStart(),
      ),
    )
    .map(([name]) => name);
}

function resolveImportedSource(
  sourceFile: SourceFile,
  specifier: string,
  project: Project,
): SourceFile | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(sourceFile.getDirectoryPath(), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
  ];
  return candidates
    .map((candidate) => project.getSourceFile(candidate))
    .find((candidate): candidate is SourceFile => candidate !== undefined);
}

function addNode(
  builder: GraphBuilder,
  node: DependencyGraphNode,
): DependencyGraphNode {
  const existing = builder.nodes.get(node.id);
  if (existing) {
    if (existing.kind !== node.kind || existing.label !== node.label) {
      throw new Error(
        `Dependency graph node identity collision for "${node.id}": ${existing.kind}/${existing.label} versus ${node.kind}/${node.label}.`,
      );
    }
    return existing;
  }
  builder.nodes.set(node.id, node);
  return node;
}

function mergeCollectorContribution(
  builder: GraphBuilder,
  collectorName: string,
  contribution: DependencyGraphContribution,
): void {
  for (const node of contribution.nodes ?? []) {
    if (!node.id || !node.kind || !node.label) {
      throw new Error(
        `Dependency graph collector "${collectorName}" returned a node without id, kind, or label.`,
      );
    }
    const existing = builder.nodes.get(node.id);
    if (
      existing &&
      (existing.kind !== node.kind || existing.label !== node.label)
    ) {
      throw new Error(
        `Dependency graph collector "${collectorName}" redefined node "${node.id}" with a different identity.`,
      );
    }
    addNode(builder, node);
  }

  for (const edge of contribution.edges ?? []) {
    if (!edge.from || !edge.to || !edge.kind) {
      throw new Error(
        `Dependency graph collector "${collectorName}" returned a relation without from, to, or kind.`,
      );
    }
    if (!builder.nodes.has(edge.from) || !builder.nodes.has(edge.to)) {
      throw new Error(
        `Dependency graph collector "${collectorName}" returned relation "${edge.from} -[${edge.kind}]-> ${edge.to}" with an unknown endpoint.`,
      );
    }
    addEdge(
      builder,
      edge.from,
      edge.to,
      edge.kind,
      edge.evidence,
      edge.details,
      edge.proof,
    );
  }

  for (const diagnostic of contribution.diagnostics ?? []) {
    builder.diagnostics.push({
      ...diagnostic,
      code: `${collectorName}/${diagnostic.code}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Task 3.3 — fold the Effect-service contribution into the graph.
//
// The owner of an edge is the component or craft service whose factory call
// encloses the `effectService(...)` call. A call that sits outside any known
// consumer is skipped: attaching it to an arbitrary node would draw an edge
// that is not true.
// ---------------------------------------------------------------------------
function collectEffectGraph(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  const services = collectEffectServices(sourceFiles);
  const dataFlow = collectDataFlowGraph(sourceFiles);
  for (const node of dataFlow.nodes) addNode(builder, node);
  for (const edge of dataFlow.edges) {
    addEdge(
      builder,
      edge.from,
      edge.to,
      edge.kind,
      edge.evidence,
      edge.details,
      edge.proof,
    );
  }
  if (services.size === 0) return;

  const operationOwners = collectEffectOperationOwners(sourceFiles, services);
  for (const owner of operationOwners.values()) addNode(builder, owner.node);

  const owners: readonly {
    start: number;
    end: number;
    id: string;
    file: string;
  }[] = [
    ...[...builder.components, ...builder.services].map((owner) => ({
      start: owner.call.getStart(),
      end: owner.call.getEnd(),
      id: owner.node.id,
      file: owner.call.getSourceFile().getFilePath(),
    })),
    ...[...builder.nodes.values()]
      .filter((node) => node.kind === 'server-function-server')
      .map((node) => ({
        start: 0,
        end: Number.MAX_SAFE_INTEGER,
        id: node.id,
        file: node.filePath ?? '',
      })),
  ];

  const ownerIdOf = (node: Node): string | undefined => {
    const file = node.getSourceFile().getFilePath();
    const start = node.getStart();
    let best: (typeof owners)[number] | undefined;
    for (const owner of owners) {
      if (owner.file !== file) continue;
      if (owner.start > start || owner.end < start) continue;
      // Innermost wins, so a service nested in a component is credited.
      if (!best || owner.end - owner.start < best.end - best.start) {
        best = owner;
      }
    }
    const enclosingPrimitive = nearestPrimitiveFactory(node);
    const primitive =
      enclosingPrimitive && primitiveFactoryName(enclosingPrimitive);
    if (enclosingPrimitive && primitive && best) {
      return addPrimitiveNode(builder, enclosingPrimitive, primitive, best.id)
        .id;
    }
    if (best) return best.id;
    const operation = [...operationOwners.values()]
      .filter(
        (candidate) =>
          candidate.filePath === file &&
          candidate.start <= start &&
          candidate.end >= start,
      )
      .sort(
        (left, right) => left.end - left.start - (right.end - right.start),
      )[0];
    return operation?.node.id;
  };

  const contribution = collectEffectServiceUsage(
    sourceFiles,
    services,
    ownerIdOf,
    true,
  );

  for (const node of contribution.nodes) {
    addNode(builder, node);
  }
  for (const edge of contribution.edges) {
    addEdge(
      builder,
      edge.from,
      edge.to,
      edge.kind,
      edge.evidence,
      edge.details,
      edge.proof,
    );
  }

  const layers = collectEffectLayers(sourceFiles, services);
  for (const node of layers.nodes) addNode(builder, node);
  for (const edge of layers.edges) {
    addEdge(
      builder,
      edge.from,
      edge.to,
      edge.kind,
      edge.evidence,
      edge.details,
      edge.proof,
    );
  }
}

type ServerFunctionPart = {
  readonly kind:
    | 'server-function-contract'
    | 'server-function-client'
    | 'server-function-server';
  readonly sourceFile: SourceFile;
  readonly family: string;
  readonly id?: string;
  readonly exposure?: string;
  readonly declaresClientContext?: boolean;
  readonly contractFamily?: string;
  readonly clientDefinitionFile?: string;
  readonly usesCraftUnique?: boolean;
  readonly clientIdentityStatic?: boolean;
  readonly runtimeServerImports?: readonly string[];
  readonly runtimeClientImports?: readonly string[];
  readonly runtimeMiddlewareImports?: readonly string[];
  readonly runtimeClientMiddlewareImports?: readonly string[];
  readonly importsServerOnly?: readonly string[];
  readonly middlewareUses?: readonly string[];
};

/**
 * Records server-function boundaries from source naming and the small public
 * API. This deliberately runs on source files, not emitted bundles: the
 * architecture check must be able to reject a bad boundary before production
 * build transforms anything.
 */
function collectServerFunctions(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  const parts: ServerFunctionPart[] = [];
  const byPath = new Map(sourceFiles.map((file) => [file.getFilePath(), file]));

  for (const sourceFile of sourceFiles) {
    const baseName = sourceFile.getBaseName();
    const suffix = serverFunctionSuffix(baseName);
    if (!suffix) continue;
    const family = sourceFile.getFilePath().slice(0, -suffix.length);
    const imports = serverFunctionImports(sourceFile, byPath);
    if (suffix === '.fn-contract.ts') {
      const contract = findServerFunctionContract(sourceFile);
      parts.push({
        kind: 'server-function-contract',
        sourceFile,
        family,
        id: contract?.id,
        exposure: contract?.exposure,
        importsServerOnly: imports.serverOnly,
      });
    } else if (suffix === '.fn-client.ts') {
      const clientContract = findClientContractFamily(sourceFile, byPath);
      parts.push({
        kind: 'server-function-client',
        sourceFile,
        family,
        id: clientContract?.id,
        contractFamily: clientContract?.family,
        clientDefinitionFile: clientContract?.definitionFile,
        usesCraftUnique: clientContract?.usesCraftUnique,
        clientIdentityStatic: clientContract?.identityStatic,
        runtimeServerImports: imports.server,
        runtimeClientImports: imports.client,
        runtimeMiddlewareImports: imports.middleware,
      });
    } else {
      const server = findServerFunction(sourceFile, byPath);
      parts.push({
        kind: 'server-function-server',
        sourceFile,
        family,
        id: server?.id,
        exposure: server?.exposure,
        declaresClientContext: server?.declaresClientContext,
        contractFamily: server?.contractFamily,
        runtimeClientImports: imports.client,
        runtimeClientMiddlewareImports: imports.clientMiddleware,
        middlewareUses: server?.middlewareUses,
      });
    }
  }

  const families = new Map<string, ServerFunctionPart[]>();
  for (const part of parts) {
    const entries = families.get(part.family) ?? [];
    entries.push(part);
    families.set(part.family, entries);
  }

  for (const [family, familyParts] of families) {
    const id = familyParts.find((part) => part.id)?.id;
    const familyNode = addNode(builder, {
      id: `server-function-family:${family}`,
      kind: 'server-function-family',
      label: id ?? relative(builder.rootDir, family),
      filePath: familyParts[0]?.sourceFile.getFilePath(),
      line: familyParts[0]?.sourceFile.getLineAndColumnAtPos(0).line,
      details: {
        family: relative(builder.rootDir, family),
        ...(id === undefined ? {} : { serverFunctionId: id }),
      },
    });

    for (const part of familyParts) {
      const node = addNode(builder, {
        id: `server-function-part:${part.kind}:${part.sourceFile.getFilePath()}`,
        kind: part.kind,
        label: id ?? part.id ?? relative(builder.rootDir, family),
        filePath: part.sourceFile.getFilePath(),
        line: part.sourceFile.getLineAndColumnAtPos(0).line,
        details: {
          family: relative(builder.rootDir, family),
          ...(part.id === undefined ? {} : { serverFunctionId: part.id }),
          ...(part.exposure === undefined ? {} : { exposure: part.exposure }),
          ...(part.declaresClientContext === undefined
            ? {}
            : { declaresClientContext: part.declaresClientContext }),
          ...(part.contractFamily === undefined
            ? {}
            : {
                contractFamily: relative(builder.rootDir, part.contractFamily),
              }),
          ...(part.clientDefinitionFile === undefined
            ? {}
            : {
                clientDefinitionFile: relative(
                  builder.rootDir,
                  part.clientDefinitionFile,
                ),
              }),
          ...(part.usesCraftUnique === undefined
            ? {}
            : { usesCraftUnique: part.usesCraftUnique }),
          ...(part.clientIdentityStatic === undefined
            ? {}
            : { clientIdentityStatic: part.clientIdentityStatic }),
          ...(part.runtimeServerImports?.length
            ? {
                runtimeServerImports: part.runtimeServerImports.map((file) =>
                  relative(builder.rootDir, file),
                ),
              }
            : {}),
          ...(part.runtimeClientImports?.length
            ? {
                runtimeClientImports: part.runtimeClientImports.map((file) =>
                  relative(builder.rootDir, file),
                ),
              }
            : {}),
          ...(part.importsServerOnly?.length
            ? {
                importsServerOnly: part.importsServerOnly.map((file) =>
                  relative(builder.rootDir, file),
                ),
              }
            : {}),
          ...(part.runtimeMiddlewareImports?.length
            ? {
                runtimeMiddlewareImports: part.runtimeMiddlewareImports.map(
                  (file) => relative(builder.rootDir, file),
                ),
              }
            : {}),
          ...(part.runtimeClientMiddlewareImports?.length
            ? {
                runtimeClientMiddlewareImports:
                  part.runtimeClientMiddlewareImports.map((file) =>
                    relative(builder.rootDir, file),
                  ),
              }
            : {}),
          ...(part.middlewareUses?.length
            ? { middlewareUses: [...part.middlewareUses] }
            : {}),
        },
      });
      addEdge(builder, familyNode.id, node.id, 'contains', 'ast');

      for (const imported of part.runtimeServerImports ?? []) {
        addEdge(
          builder,
          node.id,
          `server-function-part:server-function-server:${imported}`,
          'depends-on',
          'ast',
          {
            boundary: 'client-imports-server',
          },
        );
      }
      for (const imported of part.runtimeClientImports ?? []) {
        addEdge(
          builder,
          node.id,
          `server-function-part:server-function-client:${imported}`,
          'depends-on',
          'ast',
          {
            boundary: 'server-imports-client',
          },
        );
      }
    }
  }

  for (const sourceFile of sourceFiles) {
    if (serverFunctionSuffix(sourceFile.getBaseName())) continue;
    if (
      declaresApi(sourceFile, 'serverFunction') ||
      declaresApi(sourceFile, 'portableServerFunction')
    )
      continue;
    const misnamed = findServerFunction(sourceFile, byPath);
    if (!misnamed) continue;
    addNode(builder, {
      id: `server-function-misnamed:${sourceFile.getFilePath()}`,
      kind: 'server-function-misnamed',
      label: misnamed.id ?? relative(builder.rootDir, sourceFile.getFilePath()),
      filePath: sourceFile.getFilePath(),
      line: sourceFile.getLineAndColumnAtPos(0).line,
      details: {
        ...(misnamed.id === undefined ? {} : { serverFunctionId: misnamed.id }),
      },
    });
  }
}

/**
 * Remonte une chaîne d'appels `a(...).b(...).c(...)` depuis l'appel racine et
 * renvoie les identifiants passés en premier argument à `.<method>(...)`.
 */
/**
 * Comme `chainedCallArguments`, mais pour un `.pipe(a, b, c)` : la composition
 * est variadique, et seuls les arguments nommés désignent une brique du graphe
 * — `mapContext(...)` ou `requireServerPermission(...)` n'en sont pas.
 */
function chainedCallIdentifierArguments(
  call: CallExpression,
  method: string,
): string[] {
  const names: string[] = [];
  let current: Node = call;
  for (;;) {
    const access = current.getParentIfKind(SyntaxKind.PropertyAccessExpression);
    if (!access) break;
    const outer = access.getParentIfKind(SyntaxKind.CallExpression);
    if (!outer) break;
    if (access.getName() === method) {
      for (const argument of outer.getArguments()) {
        const identifier = argument.asKind(SyntaxKind.Identifier);
        if (identifier) names.push(identifier.getText());
      }
    }
    current = outer;
  }
  return names;
}

function chainedCallArguments(call: CallExpression, method: string): string[] {
  const names: string[] = [];
  let current: Node = call;
  for (;;) {
    const access = current.getParentIfKind(SyntaxKind.PropertyAccessExpression);
    if (!access) break;
    const outer = access.getParentIfKind(SyntaxKind.CallExpression);
    if (!outer) break;
    if (access.getName() === method) {
      const argument = outer.getArguments()[0]?.asKind(SyntaxKind.Identifier);
      if (argument) names.push(argument.getText());
    }
    current = outer;
  }
  return names;
}

/**
 * Vrai quand le fichier *définit* l'API plutôt que de l'utiliser — le module du
 * framework lui-même. Sans ce garde-fou, une analyse dont le programme inclut
 * les sources de `@craft-ts/core` signalerait la définition de `serverFunction`
 * comme une server function mal nommée.
 */
function declaresApi(sourceFile: SourceFile, name: string): boolean {
  const declaration = sourceFile.getFunction(name);
  if (
    declaration &&
    !declaration.hasDeclareKeyword() &&
    declaration.isExported()
  ) {
    return true;
  }
  const variable = sourceFile.getVariableDeclaration(name);
  return (
    variable !== undefined &&
    variable.isExported() &&
    variable.getVariableStatement()?.hasDeclareKeyword() !== true
  );
}

/** Noms des méthodes chaînées après l'appel racine, dans l'ordre rencontré. */
function chainedCallMethods(call: CallExpression): string[] {
  const names: string[] = [];
  let current: Node = call;
  for (;;) {
    const access = current.getParentIfKind(SyntaxKind.PropertyAccessExpression);
    if (!access) break;
    const outer = access.getParentIfKind(SyntaxKind.CallExpression);
    if (!outer) break;
    names.push(access.getName());
    current = outer;
  }
  return names;
}

/**
 * Clés d'objet passées à `.<method>(...)`, à travers un éventuel
 * `Schema.Struct({ ... })`. Best-effort et assumé comme tel : c'est ce qui
 * alimente le diagnostic heuristique de contexte client inutilisé.
 */
function chainedCallObjectKeys(call: CallExpression, method: string): string[] {
  const keys: string[] = [];
  let current: Node = call;
  for (;;) {
    const access = current.getParentIfKind(SyntaxKind.PropertyAccessExpression);
    if (!access) break;
    const outer = access.getParentIfKind(SyntaxKind.CallExpression);
    if (!outer) break;
    if (access.getName() === method) {
      const argument = outer.getArguments()[0];
      const literals = [
        ...(argument?.asKind(SyntaxKind.ObjectLiteralExpression)
          ? [argument.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)]
          : []),
        ...(argument?.getDescendantsOfKind(
          SyntaxKind.ObjectLiteralExpression,
        ) ?? []),
      ];
      for (const literal of literals) {
        for (const property of literal.getProperties()) {
          const name = property
            .asKind(SyntaxKind.PropertyAssignment)
            ?.getName();
          if (name) keys.push(name.replace(/^['"]|['"]$/g, ''));
        }
      }
    }
    current = outer;
  }
  return keys;
}

type ServerFunctionMiddlewarePart = {
  readonly sourceFile: SourceFile;
  readonly variableName: string;
  readonly id?: string;
  readonly uses: readonly string[];
  readonly line: number;
  /** Terminal de la chaîne : `.server(...)`, `.client(...)`, ou aucun. */
  readonly terminal?: 'server' | 'client';
  /** Clés déclarées par `.provides(Schema.Struct({ ... }))`, best-effort. */
  readonly providesKeys: readonly string[];
  /** Comment cette brique se compose : `.use(...)` historique, ou `.pipe(...)`. */
  readonly composition?: 'use' | 'pipe';
};

/**
 * Records server-function middleware declared with `craftMiddleware(...)`,
 * `portableServerMiddleware(...)`, or `effectServerMiddleware(...)`, plus
 * the `.use(...)` edges between them and towards the server functions that
 * declare them. Like the server-function boundaries above, this reads source
 * files so a bad boundary fails before any bundle transform.
 */
function collectServerFunctionMiddlewares(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  const byPath = new Map(sourceFiles.map((file) => [file.getFilePath(), file]));
  const registry = new Map<string, ServerFunctionMiddlewarePart>();

  for (const sourceFile of sourceFiles) {
    if (
      declaresApi(sourceFile, 'craftMiddleware') ||
      declaresApi(sourceFile, 'portableServerMiddleware') ||
      declaresApi(sourceFile, 'effectServerMiddleware') ||
      declaresApi(sourceFile, 'serverLayer')
    )
      continue;
    const isMiddlewareFile = isServerMiddlewareFile(sourceFile.getBaseName());
    for (const part of findCraftMiddlewares(sourceFile)) {
      // Un `.client(...)` appartient à l'autre famille : il est modélisé par
      // `collectClientFunctionMiddlewares`, pas ici.
      if (part.terminal === 'client') continue;
      if (!isMiddlewareFile) {
        addNode(builder, {
          id: `server-function-middleware-misnamed:${sourceFile.getFilePath()}#${part.variableName}`,
          kind: 'server-function-middleware-misnamed',
          label: part.id ?? part.variableName,
          filePath: sourceFile.getFilePath(),
          line: part.line,
          details: {
            ...(part.id === undefined ? {} : { middlewareId: part.id }),
            middlewareName: part.variableName,
          },
        });
        continue;
      }
      registry.set(
        middlewareKey(sourceFile.getFilePath(), part.variableName),
        part,
      );
    }
  }

  for (const part of registry.values()) {
    const clientMiddlewareImports = serverFunctionImports(
      part.sourceFile,
      byPath,
    ).clientMiddleware;
    addNode(builder, {
      id: middlewareNodeId(part.sourceFile.getFilePath(), part.variableName),
      kind: 'server-function-middleware',
      label: part.id ?? part.variableName,
      filePath: part.sourceFile.getFilePath(),
      line: part.line,
      details: {
        ...(part.id === undefined ? {} : { middlewareId: part.id }),
        middlewareName: part.variableName,
        composition: part.composition ?? 'use',
        ...(builder.middlewareCapabilities[part.id ?? part.variableName]
          ? {
              protects:
                builder.middlewareCapabilities[part.id ?? part.variableName],
            }
          : {}),
        ...(clientMiddlewareImports.length
          ? {
              runtimeClientMiddlewareImports: clientMiddlewareImports.map(
                (file) => relative(builder.rootDir, file),
              ),
            }
          : {}),
      },
    });
  }

  for (const part of registry.values()) {
    for (const used of part.uses) {
      const target = resolveMiddlewareReference(
        part.sourceFile,
        used,
        byPath,
        registry,
      );
      if (!target) continue;
      addEdge(
        builder,
        middlewareNodeId(part.sourceFile.getFilePath(), part.variableName),
        middlewareNodeId(target.sourceFile.getFilePath(), target.variableName),
        'depends-on',
        'ast',
        { boundary: 'middleware-uses' },
      );
    }
  }

  for (const sourceFile of sourceFiles) {
    if (!sourceFile.getBaseName().endsWith('.fn-serveur.ts')) continue;
    const server = findServerFunction(sourceFile, byPath);
    // Les deux compositions produisent la même arête — c'est la même
    // dépendance — mais le graphe garde de laquelle il s'agit : c'est ce qui
    // permet de vérifier qu'un exemple migré ne passe plus par `.use(...)`.
    const composed: readonly (readonly [string, 'use' | 'pipe'])[] = [
      ...(server?.middlewareUses ?? []).map(
        (used) => [used, 'use'] as const,
      ),
      ...(server?.layerPipes ?? []).map((used) => [used, 'pipe'] as const),
    ];
    for (const [used, composition] of composed) {
      const target = resolveMiddlewareReference(
        sourceFile,
        used,
        byPath,
        registry,
      );
      if (!target) continue;
      addEdge(
        builder,
        `server-function-part:server-function-server:${sourceFile.getFilePath()}`,
        middlewareNodeId(target.sourceFile.getFilePath(), target.variableName),
        'depends-on',
        'ast',
        { boundary: 'middleware-uses', composition },
      );
    }
  }
}

/**
 * Jumeau client de `collectServerFunctionMiddlewares` : modélise les
 * `craftMiddleware(...).client(...)`, leurs arêtes `.use(...)`, et les façades
 * `*.fn-client.ts` qui les attachent via `.pipe(craftClientMiddleware(...))`.
 *
 * La règle de frontière est l'inverse de celle du serveur : un middleware
 * client ne doit jamais être importé au runtime par un module serveur.
 */
function collectClientFunctionMiddlewares(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  const byPath = new Map(sourceFiles.map((file) => [file.getFilePath(), file]));
  const registry = new Map<string, ServerFunctionMiddlewarePart>();

  for (const sourceFile of sourceFiles) {
    if (
      declaresApi(sourceFile, 'craftMiddleware') ||
      declaresApi(sourceFile, 'portableServerMiddleware') ||
      declaresApi(sourceFile, 'effectServerMiddleware') ||
      declaresApi(sourceFile, 'serverLayer')
    )
      continue;
    const isClientFile = declaresClientMiddleware(sourceFile.getBaseName());
    for (const part of findCraftMiddlewares(sourceFile, byPath)) {
      if (part.terminal !== 'client') continue;
      if (!isClientFile) {
        addNode(builder, {
          id: `client-function-middleware-misnamed:${sourceFile.getFilePath()}#${part.variableName}`,
          kind: 'client-function-middleware-misnamed',
          label: part.id ?? part.variableName,
          filePath: sourceFile.getFilePath(),
          line: part.line,
          details: {
            ...(part.id === undefined ? {} : { middlewareId: part.id }),
            middlewareName: part.variableName,
          },
        });
        continue;
      }
      registry.set(
        middlewareKey(sourceFile.getFilePath(), part.variableName),
        part,
      );
    }
  }

  const serverReads = collectClientContextReads(sourceFiles);

  for (const part of registry.values()) {
    const unused = part.providesKeys.filter((key) => !serverReads.has(key));
    addNode(builder, {
      id: clientMiddlewareNodeId(
        part.sourceFile.getFilePath(),
        part.variableName,
      ),
      kind: 'client-function-middleware',
      label: part.id ?? part.variableName,
      filePath: part.sourceFile.getFilePath(),
      line: part.line,
      details: {
        ...(part.id === undefined ? {} : { middlewareId: part.id }),
        middlewareName: part.variableName,
        composition: part.composition ?? 'use',
        ...(builder.middlewareCapabilities[part.id ?? part.variableName]
          ? {
              protects:
                builder.middlewareCapabilities[part.id ?? part.variableName],
            }
          : {}),
        ...(part.providesKeys.length
          ? { providesKeys: [...part.providesKeys] }
          : {}),
        ...(part.providesKeys.length > 0 &&
        unused.length === part.providesKeys.length
          ? { unusedClientContextKeys: unused }
          : {}),
      },
    });
  }

  for (const part of registry.values()) {
    for (const used of part.uses) {
      const target = resolveMiddlewareReference(
        part.sourceFile,
        used,
        byPath,
        registry,
      );
      if (!target) continue;
      addEdge(
        builder,
        clientMiddlewareNodeId(
          part.sourceFile.getFilePath(),
          part.variableName,
        ),
        clientMiddlewareNodeId(
          target.sourceFile.getFilePath(),
          target.variableName,
        ),
        'depends-on',
        'ast',
        { boundary: 'client-middleware-uses' },
      );
    }
  }

  for (const sourceFile of sourceFiles) {
    if (!sourceFile.getBaseName().endsWith('.fn-client.ts')) continue;
    for (const used of findClientContextAttachments(sourceFile)) {
      const target = resolveMiddlewareReference(
        sourceFile,
        used,
        byPath,
        registry,
      );
      if (!target) continue;
      addEdge(
        builder,
        `server-function-part:server-function-client:${sourceFile.getFilePath()}`,
        clientMiddlewareNodeId(
          target.sourceFile.getFilePath(),
          target.variableName,
        ),
        'depends-on',
        'ast',
        { boundary: 'client-middleware-attached' },
      );
    }
  }
}

type HandshakePart = {
  readonly sourceFile: SourceFile;
  readonly variableName: string;
  readonly name?: string;
  readonly line: number;
};

/**
 * Modélise les `craftHandshake(...)` et, pour chacun, les fichiers qui le
 * référencent — classés par côté de la frontière d'après leur suffixe.
 *
 * C'est tout ce dont la règle a besoin : un handshake est tenu quand au moins
 * un module serveur et au moins un module client le référencent. Le contrôle
 * est **exact**, puisqu'il compare des identifiants et non des noms de clés
 * devinés dans l'AST.
 */
function collectHandshakes(
  builder: GraphBuilder,
  sourceFiles: readonly SourceFile[],
): void {
  const byPath = new Map(sourceFiles.map((file) => [file.getFilePath(), file]));
  const registry = new Map<string, HandshakePart>();

  for (const sourceFile of sourceFiles) {
    if (declaresApi(sourceFile, 'craftHandshake')) continue;
    for (const declaration of sourceFile.getVariableDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer) continue;
      const call = [
        ...(Node.isCallExpression(initializer) ? [initializer] : []),
        ...initializer.getDescendantsOfKind(SyntaxKind.CallExpression),
      ].find(
        (candidate) => candidate.getExpression().getText() === 'craftHandshake',
      );
      if (!call) continue;
      const name = call
        .getArguments()[0]
        ?.asKind(SyntaxKind.StringLiteral)
        ?.getLiteralValue();
      registry.set(
        handshakeKey(sourceFile.getFilePath(), declaration.getName()),
        {
          sourceFile,
          variableName: declaration.getName(),
          ...(name === undefined ? {} : { name }),
          line: declaration.getStartLineNumber(),
        },
      );
    }
  }

  const sides = new Map<
    HandshakePart,
    { server: string[]; client: string[] }
  >();
  for (const part of registry.values()) {
    sides.set(part, { server: [], client: [] });
  }

  for (const sourceFile of sourceFiles) {
    const side = handshakeSide(sourceFile.getBaseName());
    if (!side) continue;
    for (const part of referencedHandshakes(sourceFile, byPath, registry)) {
      sides
        .get(part)
        ?.[side].push(relative(builder.rootDir, sourceFile.getFilePath()));
    }
  }

  for (const [part, reached] of sides) {
    addNode(builder, {
      id: handshakeNodeId(part.sourceFile.getFilePath(), part.variableName),
      kind: 'handshake',
      label: part.name ?? part.variableName,
      filePath: part.sourceFile.getFilePath(),
      line: part.line,
      details: {
        ...(part.name === undefined
          ? { static: false }
          : { handshakeName: part.name }),
        handshakeVariable: part.variableName,
        ...(reached.server.length ? { serverSites: reached.server } : {}),
        ...(reached.client.length ? { clientSites: reached.client } : {}),
      },
    });
  }
}

/**
 * Résout un identifiant vers le nom du `craftHandshake(...)` qu'il désigne,
 * déclaré localement ou importé. Autonome à dessein : l'identité des server
 * functions est collectée avant les handshakes.
 */
function resolveHandshakeName(
  sourceFile: SourceFile,
  name: string,
  byPath: ReadonlyMap<string, SourceFile>,
): string | undefined {
  const local = handshakeNameOfDeclaration(sourceFile, name);
  if (local !== undefined) return local;

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.isTypeOnly()) continue;
    const named = declaration
      .getNamedImports()
      .find(
        (candidate) =>
          (candidate.getAliasNode()?.getText() ?? candidate.getName()) === name,
      );
    if (!named || named.isTypeOnly()) continue;
    const imported = resolveImportedSource(
      sourceFile,
      declaration.getModuleSpecifierValue(),
      sourceFile.getProject(),
    );
    if (!imported || !byPath.has(imported.getFilePath())) continue;
    const resolved = handshakeNameOfDeclaration(imported, named.getName());
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

function handshakeNameOfDeclaration(
  sourceFile: SourceFile,
  variableName: string,
): string | undefined {
  const initializer = sourceFile
    .getVariableDeclaration(variableName)
    ?.getInitializer();
  if (!initializer) return undefined;
  const call = [
    ...(Node.isCallExpression(initializer) ? [initializer] : []),
    ...initializer.getDescendantsOfKind(SyntaxKind.CallExpression),
  ].find(
    (candidate) => candidate.getExpression().getText() === 'craftHandshake',
  );
  return call
    ?.getArguments()[0]
    ?.asKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
}

function handshakeKey(filePath: string, variableName: string): string {
  return `${filePath}#${variableName}`;
}

function handshakeNodeId(filePath: string, variableName: string): string {
  return `handshake:${handshakeKey(filePath, variableName)}`;
}

/** De quel côté de la frontière un fichier parle, d'après sa convention de nom. */
function handshakeSide(baseName: string): 'server' | 'client' | undefined {
  if (baseName.endsWith('.fn-serveur.ts') || isServerMiddlewareFile(baseName)) {
    return 'server';
  }
  if (baseName.endsWith('.fn-client.ts') || isClientMiddlewareFile(baseName)) {
    return 'client';
  }
  return undefined;
}

/** Les handshakes qu'un fichier référence, déclarés localement ou importés. */
function referencedHandshakes(
  sourceFile: SourceFile,
  byPath: ReadonlyMap<string, SourceFile>,
  registry: ReadonlyMap<string, HandshakePart>,
): HandshakePart[] {
  const found = new Set<HandshakePart>();

  for (const identifier of sourceFile.getDescendantsOfKind(
    SyntaxKind.Identifier,
  )) {
    const local = registry.get(
      handshakeKey(sourceFile.getFilePath(), identifier.getText()),
    );
    if (
      local &&
      identifier.getParent()?.getKind() !== SyntaxKind.VariableDeclaration
    ) {
      found.add(local);
    }
  }

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.isTypeOnly()) continue;
    const imported = resolveImportedSource(
      sourceFile,
      declaration.getModuleSpecifierValue(),
      sourceFile.getProject(),
    );
    if (!imported || !byPath.has(imported.getFilePath())) continue;
    for (const named of declaration.getNamedImports()) {
      if (named.isTypeOnly()) continue;
      const part = registry.get(
        handshakeKey(imported.getFilePath(), named.getName()),
      );
      if (part) found.add(part);
    }
  }

  return [...found];
}

function clientMiddlewareNodeId(
  filePath: string,
  variableName: string,
): string {
  return `client-function-middleware:${middlewareKey(filePath, variableName)}`;
}

/**
 * Identifiants passés à `craftClientMiddleware(...)` dans une façade client.
 * Les arguments doivent être des identifiants statiques : une valeur construite
 * dynamiquement échappe au graphe, comme partout ailleurs dans cette analyse.
 */
function findClientContextAttachments(sourceFile: SourceFile): string[] {
  const names: string[] = [];
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (call.getExpression().getText() !== 'craftClientMiddleware') continue;
    for (const argument of call.getArguments()) {
      const identifier = argument.asKind(SyntaxKind.Identifier);
      if (identifier) names.push(identifier.getText());
    }
  }
  return names;
}

/**
 * Clés du contexte client réellement lues côté serveur
 * (`context.clientContext.<clé>`), tous fichiers serveur confondus.
 *
 * Heuristique assumée : une lecture indirecte (déstructuration réexportée,
 * accès par variable) n'est pas vue. Le diagnostic qui s'en sert le dit.
 */
function collectClientContextReads(
  sourceFiles: readonly SourceFile[],
): Set<string> {
  const reads = new Set<string>();
  for (const sourceFile of sourceFiles) {
    const baseName = sourceFile.getBaseName();
    if (
      !baseName.endsWith('.fn-serveur.ts') &&
      !isServerMiddlewareFile(baseName)
    ) {
      continue;
    }
    for (const access of sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      if (!access.getExpression().getText().endsWith('clientContext')) continue;
      reads.add(access.getName());
    }
    for (const pattern of sourceFile.getDescendantsOfKind(
      SyntaxKind.ObjectBindingPattern,
    )) {
      const initializer = pattern
        .getParentIfKind(SyntaxKind.VariableDeclaration)
        ?.getInitializer();
      if (initializer?.getText().endsWith('clientContext') !== true) continue;
      for (const element of pattern.getElements()) {
        reads.add(
          element.getPropertyNameNode()?.getText() ?? element.getName(),
        );
      }
    }
  }
  return reads;
}

function middlewareKey(filePath: string, variableName: string): string {
  return `${filePath}#${variableName}`;
}

function middlewareNodeId(filePath: string, variableName: string): string {
  return `server-function-middleware:${middlewareKey(filePath, variableName)}`;
}

function findCraftMiddlewares(
  sourceFile: SourceFile,
  byPath?: ReadonlyMap<string, SourceFile>,
): ServerFunctionMiddlewarePart[] {
  const parts: ServerFunctionMiddlewarePart[] = [];
  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    const candidates = [
      ...(Node.isCallExpression(initializer) ? [initializer] : []),
      ...initializer.getDescendantsOfKind(SyntaxKind.CallExpression),
    ];
    // `craftHandshakeMiddleware(handshake, run)` est un middleware client
    // complet en une déclaration : son id et son schéma viennent du handshake.
    const handshakeCall = candidates.find(
      (candidate) =>
        candidate.getExpression().getText() === 'craftHandshakeMiddleware',
    );
    if (handshakeCall && byPath) {
      const reference = handshakeCall
        .getArguments()[0]
        ?.asKind(SyntaxKind.Identifier);
      const name = reference
        ? resolveHandshakeName(sourceFile, reference.getText(), byPath)
        : undefined;
      parts.push({
        sourceFile,
        variableName: declaration.getName(),
        ...(name === undefined ? {} : { id: name }),
        uses: [],
        line: declaration.getStartLineNumber(),
        terminal: 'client',
        providesKeys: [],
      });
      continue;
    }

    // `serverLayer(...)` compose un programme plutôt qu'un Effect, mais c'est
    // la même famille pour le graphe : mêmes règles d'id, de nommage de
    // fichier et de frontière client/serveur.
    const layerCall = candidates.find((candidate) =>
      ['serverLayer', 'serverLayerReading'].includes(
        candidate.getExpression().getText(),
      ),
    );
    if (layerCall) {
      // `serverLayerReading<Ctx>()('id', run)` : l'identifiant est porté par
      // l'appel extérieur, celui qui suit la curryfication.
      const idCall =
        layerCall.getExpression().getText() === 'serverLayerReading'
          ? layerCall.getParentIfKind(SyntaxKind.CallExpression)
          : layerCall;
      const layerId = idCall
        ?.getArguments()[0]
        ?.asKind(SyntaxKind.StringLiteral)
        ?.getLiteralValue();
      parts.push({
        sourceFile,
        variableName: declaration.getName(),
        ...(layerId === undefined ? {} : { id: layerId }),
        uses: [],
        line: declaration.getStartLineNumber(),
        terminal: 'server',
        providesKeys: [],
        composition: 'pipe',
      });
      continue;
    }

    const call = candidates.find((candidate) =>
      [
        'craftMiddleware',
        'portableServerMiddleware',
        'effectServerMiddleware',
      ].includes(candidate.getExpression().getText()),
    );
    if (!call) continue;
    const id = call
      .getArguments()[0]
      ?.asKind(SyntaxKind.StringLiteral)
      ?.getLiteralValue();
    const methods = chainedCallMethods(call);
    const constructor = call.getExpression().getText();
    const terminal =
      constructor === 'portableServerMiddleware' ||
      constructor === 'effectServerMiddleware'
        ? ('server' as const)
        : methods.includes('client')
          ? ('client' as const)
          : methods.includes('server')
            ? ('server' as const)
            : undefined;
    parts.push({
      sourceFile,
      variableName: declaration.getName(),
      ...(id === undefined ? {} : { id }),
      uses: [
        ...chainedCallArguments(call, 'use'),
        ...chainedCallIdentifierArguments(call, 'pipe'),
      ],
      line: declaration.getStartLineNumber(),
      ...(terminal === undefined ? {} : { terminal }),
      providesKeys: chainedCallObjectKeys(call, 'provides'),
      composition: chainedCallIdentifierArguments(call, 'pipe').length
        ? 'pipe'
        : 'use',
    });
  }
  return parts;
}

/** Résout un identifiant de middleware, déclaré localement ou importé. */
function resolveMiddlewareReference(
  sourceFile: SourceFile,
  name: string,
  byPath: ReadonlyMap<string, SourceFile>,
  registry: ReadonlyMap<string, ServerFunctionMiddlewarePart>,
): ServerFunctionMiddlewarePart | undefined {
  const local = registry.get(middlewareKey(sourceFile.getFilePath(), name));
  if (local) return local;

  for (const declaration of sourceFile.getImportDeclarations()) {
    const named = declaration
      .getNamedImports()
      .find(
        (candidate) =>
          (candidate.getAliasNode()?.getText() ?? candidate.getName()) === name,
      );
    if (!named) continue;
    const imported = resolveImportedSource(
      sourceFile,
      declaration.getModuleSpecifierValue(),
      sourceFile.getProject(),
    );
    if (!imported || !byPath.has(imported.getFilePath())) continue;
    return registry.get(middlewareKey(imported.getFilePath(), named.getName()));
  }
  return undefined;
}

function serverFunctionSuffix(
  baseName: string,
): '.fn-contract.ts' | '.fn-client.ts' | '.fn-serveur.ts' | undefined {
  if (baseName.endsWith('.fn-contract.ts')) return '.fn-contract.ts';
  if (baseName.endsWith('.fn-client.ts')) return '.fn-client.ts';
  if (baseName.endsWith('.fn-serveur.ts')) return '.fn-serveur.ts';
  return undefined;
}

function serverFunctionImports(
  sourceFile: SourceFile,
  byPath: ReadonlyMap<string, SourceFile>,
): {
  server: string[];
  client: string[];
  serverOnly: string[];
  middleware: string[];
  clientMiddleware: string[];
} {
  const server: string[] = [];
  const client: string[] = [];
  const serverOnly: string[] = [];
  const middleware: string[] = [];
  const clientMiddleware: string[] = [];
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.isTypeOnly()) continue;
    const imported = resolveImportedSource(
      sourceFile,
      declaration.getModuleSpecifierValue(),
      sourceFile.getProject(),
    );
    if (!imported || !byPath.has(imported.getFilePath())) continue;
    const suffix = serverFunctionSuffix(imported.getBaseName());
    if (suffix === '.fn-serveur.ts') server.push(imported.getFilePath());
    if (suffix === '.fn-client.ts') client.push(imported.getFilePath());
    if (imported.getBaseName().includes('.server.')) {
      serverOnly.push(imported.getFilePath());
    }
    if (isServerMiddlewareFile(imported.getBaseName())) {
      middleware.push(imported.getFilePath());
    }
    if (isClientMiddlewareFile(imported.getBaseName())) {
      clientMiddleware.push(imported.getFilePath());
    }
  }
  return { server, client, serverOnly, middleware, clientMiddleware };
}

function isServerMiddlewareFile(baseName: string): boolean {
  return baseName.endsWith('.mw-serveur.ts');
}

function isClientMiddlewareFile(baseName: string): boolean {
  return baseName.endsWith('.mw-client.ts');
}

/**
 * Où un `craftMiddleware(...).client(...)` a le droit de vivre.
 *
 * `*.mw-client.ts` pour ce qui est réutilisable, mais aussi `*.fn-client.ts` :
 * une façade est déjà un module purement navigateur, déjà tenue à l'écart du
 * bundle serveur par les règles de famille, et c'est là que le contexte
 * d'injection est disponible sans cérémonie. Interdire un middleware d'un seul
 * usage à côté de la façade qui l'utilise coûterait un fichier pour rien.
 */
function declaresClientMiddleware(baseName: string): boolean {
  return isClientMiddlewareFile(baseName) || baseName.endsWith('.fn-client.ts');
}

function findServerFunctionContract(
  sourceFile: SourceFile,
): { id?: string; exposure?: string } | undefined {
  const call = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find(
      (candidate) =>
        candidate.getExpression().getText() === 'serverFunctionContract',
    );
  const object = call
    ?.getArguments()[0]
    ?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!object) return undefined;
  return {
    id: getStringProperty(object, 'id'),
    exposure: getStringProperty(object, 'exposure'),
  };
}

function findServerFunction(
  sourceFile: SourceFile,
  byPath: ReadonlyMap<string, SourceFile>,
):
  | {
      id?: string;
      exposure?: string;
      declaresClientContext: boolean;
      contractFamily?: string;
      middlewareUses: readonly string[];
      /** Briques nommées passées à `.pipe(...)`, dans l'ordre déclaré. */
      layerPipes: readonly string[];
    }
  | undefined {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  const serverCall = calls.find((candidate) => {
    const expression = candidate.getExpression().getText();
    return (
      expression === 'serverFunction' || expression === 'portableServerFunction'
    );
  });
  if (!serverCall) return undefined;
  const first = serverCall.getArguments()[0];
  const directId = first?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
  const firstIdentifier = first?.asKind(SyntaxKind.Identifier);
  const handshakeId = firstIdentifier
    ? resolveHandshakeName(sourceFile, firstIdentifier.getText(), byPath)
    : undefined;
  // Un handshake porte l'id ; seul un identifiant qui n'en est pas un désigne
  // un contrat importé d'un `*.fn-contract.ts`.
  const contractIdentifier =
    handshakeId === undefined ? firstIdentifier : undefined;
  let contractFamily: string | undefined;
  let id = directId ?? handshakeId;
  if (contractIdentifier) {
    const importDeclaration = sourceFile
      .getImportDeclarations()
      .find((declaration) =>
        declaration
          .getNamedImports()
          .some(
            (named) =>
              named.getAliasNode()?.getText() ===
                contractIdentifier.getText() ||
              named.getName() === contractIdentifier.getText(),
          ),
      );
    const imported = importDeclaration
      ? resolveImportedSource(
          sourceFile,
          importDeclaration.getModuleSpecifierValue(),
          sourceFile.getProject(),
        )
      : undefined;
    if (imported && byPath.has(imported.getFilePath())) {
      contractFamily = imported.getFilePath().replace(/\.fn-contract\.ts$/, '');
      const contract = findServerFunctionContract(imported);
      id = contract?.id;
    }
  }
  const options = serverCall
    .getArguments()[2]
    ?.asKind(SyntaxKind.ObjectLiteralExpression);
  // Une fonction qui déclare attendre un contexte du navigateur n'a de sens
  // que si un navigateur peut l'appeler.
  const declaresClientContext =
    options?.getProperty('clientContext') !== undefined;
  const middlewareUses = chainedCallArguments(serverCall, 'use');
  const layerPipes = chainedCallIdentifierArguments(serverCall, 'pipe');
  return {
    id,
    middlewareUses,
    layerPipes,
    exposure:
      contractIdentifier === undefined
        ? (getStringProperty(options, 'exposure') ?? 'server')
        : 'client',
    declaresClientContext,
    ...(contractFamily === undefined ? {} : { contractFamily }),
  };
}

function findClientContractFamily(
  sourceFile: SourceFile,
  byPath: ReadonlyMap<string, SourceFile>,
):
  | {
      id?: string;
      family?: string;
      definitionFile?: string;
      usesCraftUnique?: boolean;
      identityStatic?: boolean;
    }
  | undefined {
  const call = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find(
      (candidate) =>
        candidate.getExpression().getText() === 'createServerFunctionClient',
    );
  if (!call) return undefined;

  const identity = findClientIdentity(call, byPath);
  const serverDefinition = findClientServerDefinition(sourceFile, call, byPath);

  if (serverDefinition) {
    return {
      id: identity.id ?? serverDefinition.id,
      family: sourceFile.getFilePath().replace(/\.fn-client\.ts$/, ''),
      definitionFile: serverDefinition.filePath,
      ...(identity.usesCraftUnique === undefined
        ? {}
        : { usesCraftUnique: identity.usesCraftUnique }),
      ...(identity.identityStatic === undefined
        ? {}
        : { identityStatic: identity.identityStatic }),
    };
  }

  const identifier = call?.getArguments()[0]?.asKind(SyntaxKind.Identifier);
  const directId = call
    ?.getArguments()[0]
    ?.asKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
  const declaration = identifier
    ? sourceFile
        .getImportDeclarations()
        .find((candidate) =>
          candidate
            .getNamedImports()
            .some(
              (named) =>
                named.getName() === identifier.getText() ||
                named.getAliasNode()?.getText() === identifier.getText(),
            ),
        )
    : undefined;
  const imported = declaration
    ? resolveImportedSource(
        sourceFile,
        declaration.getModuleSpecifierValue(),
        sourceFile.getProject(),
      )
    : undefined;
  if (imported && byPath.has(imported.getFilePath())) {
    const contract = findServerFunctionContract(imported);
    return {
      id: identity.id ?? contract?.id,
      family: sourceFile.getFilePath().replace(/\.fn-client\.ts$/, ''),
      ...(identity.usesCraftUnique === undefined
        ? {}
        : { usesCraftUnique: identity.usesCraftUnique }),
      ...(identity.identityStatic === undefined
        ? {}
        : { identityStatic: identity.identityStatic }),
    };
  }

  const serverImport = sourceFile.getImportDeclarations().find((candidate) => {
    const resolved = resolveImportedSource(
      sourceFile,
      candidate.getModuleSpecifierValue(),
      sourceFile.getProject(),
    );
    return resolved?.getBaseName().endsWith('.fn-serveur.ts') === true;
  });
  const server = serverImport
    ? resolveImportedSource(
        sourceFile,
        serverImport.getModuleSpecifierValue(),
        sourceFile.getProject(),
      )
    : undefined;
  if (!server || !byPath.has(server.getFilePath())) return undefined;
  const serverFunction = findServerFunction(server, byPath);
  return {
    id: identity.id ?? directId ?? serverFunction?.id,
    family: sourceFile.getFilePath().replace(/\.fn-client\.ts$/, ''),
    definitionFile: server.getFilePath(),
    ...(identity.usesCraftUnique === undefined
      ? {}
      : { usesCraftUnique: identity.usesCraftUnique }),
    ...(identity.identityStatic === undefined
      ? {}
      : { identityStatic: identity.identityStatic }),
  };
}

function findClientIdentity(
  call: CallExpression,
  byPath: ReadonlyMap<string, SourceFile>,
): {
  id?: string;
  usesCraftUnique?: boolean;
  identityStatic?: boolean;
  usesHandshake?: boolean;
} {
  const argument = call.getArguments()[0];
  const identifier = argument?.asKind(SyntaxKind.Identifier);
  if (identifier) {
    // Un handshake référencé vaut identité partagée : les deux côtés passent la
    // même valeur, donc l'égalité des ids est déjà tenue par TypeScript.
    const handshake = resolveHandshakeName(
      call.getSourceFile(),
      identifier.getText(),
      byPath,
    );
    if (handshake !== undefined) {
      return {
        id: handshake,
        usesHandshake: true,
        usesCraftUnique: true,
        identityStatic: true,
      };
    }
  }
  if (!argument?.isKind(SyntaxKind.CallExpression)) {
    return {};
  }
  if (argument.getExpression().getText() !== 'craftUnique') {
    return { usesCraftUnique: false };
  }
  const value = argument.getArguments()[0];
  if (
    !value ||
    (!value.isKind(SyntaxKind.StringLiteral) &&
      !value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral))
  ) {
    return { usesCraftUnique: true, identityStatic: false };
  }
  return {
    id: value.getLiteralValue(),
    usesCraftUnique: true,
    identityStatic: true,
  };
}

function findClientServerDefinition(
  sourceFile: SourceFile,
  call: CallExpression,
  byPath: ReadonlyMap<string, SourceFile>,
): { filePath: string; id?: string } | undefined {
  const typeArgument = call.getTypeArguments()[0];
  const match = /^typeof\s+([A-Za-z_$][\w$]*)$/.exec(
    typeArgument?.getText() ?? '',
  );
  if (!match) return undefined;
  const importedName = match[1];
  const importDeclaration = sourceFile
    .getImportDeclarations()
    .find((declaration) =>
      declaration
        .getNamedImports()
        .some(
          (specifier) =>
            (specifier.getAliasNode()?.getText() ?? specifier.getName()) ===
            importedName,
        ),
    );
  if (!importDeclaration) return undefined;
  const imported = resolveImportedSource(
    sourceFile,
    importDeclaration.getModuleSpecifierValue(),
    sourceFile.getProject(),
  );
  if (!imported || !byPath.has(imported.getFilePath())) return undefined;
  if (!imported.getBaseName().endsWith('.fn-serveur.ts')) return undefined;
  const server = findServerFunction(imported, byPath);
  return {
    filePath: imported.getFilePath(),
    id: server?.id,
  };
}

function addEdge(
  builder: GraphBuilder,
  from: string,
  to: string,
  kind: DependencyGraphEdgeKind,
  evidence: 'ast' | 'type',
  details?: Record<string, unknown>,
  proof?: DependencyGraphProof,
): void {
  if (from === to) return;
  const key = `${from}:${kind}:${to}`;
  const existing = builder.edges.get(key);
  if (existing) {
    if (details) {
      const previousUsage = existing.details?.['usage'];
      existing.details = { ...(existing.details ?? {}), ...details };
      if (previousUsage && details['usage']) {
        existing.details['usage'] = mergeUsageValues(
          previousUsage,
          details['usage'],
        );
      }
      if (kind === 'calls' && details['callSite']) {
        const callSites = [
          ...readCallSites(existing.details?.['callSites']),
          { ...readCallSite(details['callSite']), ownerId: from },
        ].filter(isCallSite);
        existing.details['callSites'] = uniqueCallSites(callSites);
      }
    }
    if (proof && !existing.proof) existing.proof = proof;
    return;
  }
  const initialDetails =
    kind === 'calls' && details?.['callSite']
      ? {
          ...details,
          callSites: [
            { ...readCallSite(details['callSite']), ownerId: from },
          ].filter(isCallSite),
        }
      : details;
  builder.edges.set(key, {
    from,
    to,
    kind,
    evidence,
    details: initialDetails,
    proof,
  });
}

type GraphCallSite = {
  ownerId?: string;
  filePath?: string;
  line?: number;
  offset?: number;
};

function readCallSite(value: unknown): GraphCallSite {
  if (!value || typeof value !== 'object') return {};
  const site = value as Record<string, unknown>;
  return {
    ...(typeof site['ownerId'] === 'string'
      ? { ownerId: site['ownerId'] }
      : {}),
    ...(typeof site['filePath'] === 'string'
      ? { filePath: site['filePath'] }
      : {}),
    ...(typeof site['line'] === 'number' ? { line: site['line'] } : {}),
    ...(typeof site['offset'] === 'number'
      ? { offset: site['offset'] }
      : {}),
  };
}

function readCallSites(value: unknown): GraphCallSite[] {
  return Array.isArray(value) ? value.map(readCallSite).filter(isCallSite) : [];
}

function isCallSite(value: GraphCallSite): boolean {
  return (
    typeof value.filePath === 'string' &&
    typeof value.line === 'number' &&
    typeof value.offset === 'number'
  );
}

function uniqueCallSites(sites: readonly GraphCallSite[]): GraphCallSite[] {
  const seen = new Set<string>();
  return sites.filter((site) => {
    const key = `${site.ownerId ?? ''}:${site.filePath}:${site.offset}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeUsageDetail(
  node: DependencyGraphNode,
  key: string,
  usage: string,
): void {
  if (!node.details) node.details = {};
  const previous = node.details[key];
  node.details[key] = previous ? mergeUsageValues(previous, usage) : usage;
}

function mergeUsageValues(previous: unknown, next: unknown): string {
  return [
    ...new Set(
      [String(previous), String(next)].flatMap((value) => value.split('+')),
    ),
  ]
    .sort()
    .join('+');
}

function getStringArgument(
  call: CallExpression,
  index: number,
): string | undefined {
  return call
    .getArguments()
    [index]?.asKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
}

function getStringProperty(
  object: ObjectLiteralExpression | undefined,
  name: string,
): string | undefined {
  return object
    ?.getProperty(name)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer()
    ?.asKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
}

function getBooleanProperty(
  object: ObjectLiteralExpression | undefined,
  name: string,
): boolean | undefined {
  const initializer = object
    ?.getProperty(name)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer();
  if (!initializer) return undefined;
  if (initializer.getKind() === SyntaxKind.TrueKeyword) return true;
  if (initializer.getKind() === SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function addBindingNames(node: Node, target: Set<string>): void {
  for (const name of getBindingNames(node)) target.add(name);
}

function getBindingNames(node: Node): string[] {
  if (Node.isIdentifier(node)) return [node.getText()];
  if (Node.isObjectBindingPattern(node)) {
    return node.getElements().flatMap((element) => {
      if (!Node.isBindingElement(element)) return [];
      return getBindingNames(element.getNameNode());
    });
  }
  if (Node.isArrayBindingPattern(node)) {
    return node
      .getElements()
      .flatMap((element) =>
        Node.isBindingElement(element)
          ? getBindingNames(element.getNameNode())
          : [],
      );
  }
  return [];
}

function inferNameFromServiceDeclaration(
  call: CallExpression,
): string | undefined {
  const declaration = call.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  const name = declaration?.getNameNode();
  return name && Node.isIdentifier(name) ? name.getText() : undefined;
}

function detectTsConfig(rootDir: string): string {
  for (const candidate of ['tsconfig.app.json', 'tsconfig.json']) {
    const path = resolve(rootDir, candidate);
    if (existsSync(path)) return candidate;
  }
  return 'tsconfig.json';
}

function escapeMermaid(value: string): string {
  return value
    .split('"')
    .join('\\"')
    .split('|')
    .join('/')
    .split('\n')
    .join(' ');
}
