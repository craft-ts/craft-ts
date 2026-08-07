import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  CallExpression,
  Node,
  ObjectBindingPattern,
  ObjectLiteralExpression,
  Project,
  PropertyAccessExpression,
  SourceFile,
  SyntaxKind,
  VariableDeclaration,
  YieldExpression,
} from 'ts-morph';

export type DependencyGraphNodeKind =
  | 'route'
  | 'route-hook'
  | 'component'
  | 'service'
  | 'property'
  | 'primitive'
  | 'source';

export type DependencyGraphEdgeKind =
  | 'loads'
  | 'renders'
  | 'contains'
  | 'depends-on'
  | 'uses-property'
  | 'reads'
  | 'writes'
  | 'subscribes'
  | 'triggers';

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

export type DependencyGraphEdge = {
  from: string;
  to: string;
  kind: DependencyGraphEdgeKind;
  evidence: 'ast' | 'type';
  details?: Record<string, unknown>;
};

export type DependencyGraph = {
  version: 1;
  rootDir: string;
  tsConfigFilePath: string;
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
};

export type AnalyzeDependencyGraphOptions = {
  rootDir?: string;
  tsConfigFilePath?: string;
  include?: readonly string[];
};

export type WriteDependencyGraphOptions = AnalyzeDependencyGraphOptions & {
  outputPath: string;
  format?: 'json' | 'mermaid' | 'html' | 'both' | 'all';
};

const PRIMITIVES = new Set([
  'state',
  'query',
  'mutation',
  'asyncProcess',
  'queryParams',
  'insertSelect',
  'craftComputed',
  'craftEffect',
  'craftMethod',
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
};

type SourceInfo = {
  node: DependencyGraphNode;
  variableNames: Set<string>;
};

type CraftHttpClientUsage = DependencyGraphHttpEndpoint;

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
  serviceByHelperKey: Map<string, ServiceInfo>;
  servicesByHelperName: Map<string, ServiceInfo[]>;
  componentByVariable: Map<string, ComponentInfo>;
  componentByVariableKey: Map<string, ComponentInfo>;
  componentsByVariableName: Map<string, ComponentInfo[]>;
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
    },
    nodes: new Map(),
    edges: new Map(),
    services: [],
    components: [],
    sources: [],
    routeFiles: new Map(),
    serviceByHelperKey: new Map(),
    servicesByHelperName: new Map(),
    componentByVariable: new Map(),
    componentByVariableKey: new Map(),
    componentsByVariableName: new Map(),
  };

  const sourceFiles = project
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile())
    .filter((sourceFile) =>
      options.include?.length
        ? options.include.some((pattern) => sourceFile.getFilePath().includes(pattern))
        : true,
    );

  collectServices(builder, sourceFiles);
  collectSources(builder, sourceFiles);
  collectComponents(builder, sourceFiles);
  collectRoutes(builder, sourceFiles);
  analyzeServiceBodies(builder);
  analyzeComponents(builder);
  analyzeRoutes(builder);

  builder.graph.nodes = [...builder.nodes.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  builder.graph.edges = [...builder.edges.values()].sort((left, right) =>
    `${left.from}:${left.kind}:${left.to}`.localeCompare(
      `${right.from}:${right.kind}:${right.to}`,
    ),
  );
  return builder.graph;
}

export async function writeDependencyGraph(
  options: WriteDependencyGraphOptions,
): Promise<DependencyGraph> {
  const graph = analyzeDependencyGraph(options);
  const format = options.format ?? 'both';
  const outputPath = resolve(options.rootDir ?? process.cwd(), options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });

  if (format === 'json' || format === 'both' || format === 'all') {
    const jsonPath = format === 'json' ? outputPath : `${outputPath}.json`;
    await writeFile(jsonPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  }
  if (format === 'mermaid' || format === 'both' || format === 'all') {
    const mermaidPath = format === 'mermaid' ? outputPath : `${outputPath}.mmd`;
    await writeFile(mermaidPath, `${dependencyGraphToMermaid(graph)}\n`, 'utf8');
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
  <title>Craft NG — Dependency Explorer</title>
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
    .tree { display: grid; gap: 12px; }
    .graph-scroll { overflow-x: auto; overflow-y: hidden; margin: 0 -8px; padding: 8px; border: 1px solid var(--line); border-radius: 12px; background: #eef2f8; }
    .graph-canvas { position: relative; display: grid; grid-template-columns: repeat(5, minmax(220px, 255px)); gap: 52px; min-width: 1530px; min-height: 620px; padding: 26px 28px 42px; }
    .graph-edges { position: absolute; z-index: 5; inset: 0; overflow: visible; pointer-events: none; }
    .graph-edges path { fill: none; stroke: #aebbd0; stroke-width: 1.7; opacity: .82; }
    .graph-edges path.edge-depends-on { stroke: #00a884; stroke-width: 3.2; }
    .graph-edges path.edge-primitive-member { stroke: #a7d8ca; stroke-width: 1.8; opacity: .78; }
    .graph-edges path.edge-contains { stroke: #d79a22; stroke-dasharray: 5 3; }
    .graph-edges path.edge-uses-property { stroke: #7c4dff; }
    .graph-edges path.edge-uses-property.edge-template { stroke: #7c4dff; }
    .graph-edges path.edge-uses-property.edge-setup { stroke: #72a9d2; }
    .graph-edges path.edge-uses-property.edge-both { stroke: #ae70c7; }
    .graph-edges path.edge-reads, .graph-edges path.edge-writes, .graph-edges path.edge-subscribes, .graph-edges path.edge-triggers { stroke: #1292c9; stroke-dasharray: 3 3; }
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
    .graph-card.kind-route-hook { border-left-color: #7d8798; }
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
    .kind-route-hook { border-left: 4px solid #7d8798; }
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
      <div class="brand"><h1>Craft NG · Dependency Explorer</h1><p>Analyse statique AST + typage TypeScript</p></div>
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
      <div class="legend"><span class="legend-item"><span class="legend-line template"></span>Template</span><span class="legend-item"><span class="legend-line setup"></span>Setup</span><span class="legend-item"><span class="legend-line both"></span>Template + setup</span></div>
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
    const filters = [['all', 'Tout'], ['component', 'Composants'], ['service', 'Services'], ['primitive', 'Primitives'], ['source', 'Sources']];

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
      return ({ 'route': 'route', 'route-hook': 'hook', 'component': 'composant', 'service': 'service', 'property': 'champ', 'primitive': 'primitive', 'source': 'source$' })[kind] || kind;
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
      return [...new Set((outgoing.get(parentId) || []).filter(function (edge) { return edge.to === childId; }).map(function (edge) { return edge.kind; }))];
    }
    function childIds(nodeId) {
      const seen = new Set();
      return (outgoing.get(nodeId) || []).map(function (edge) { return edge.to; }).filter(function (id) {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    function relationGroupLabel(kinds) {
      if (kinds.some(function (kind) { return kind === 'loads' || kind === 'renders'; })) return 'Routes et composants';
      if (kinds.some(function (kind) { return kind === 'depends-on'; })) return 'Dépendances externes';
      if (kinds.some(function (kind) { return kind === 'uses-property'; })) return 'Champs utilisés';
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
    function renderInternalNode(nodeId, ids, trail) {
      if (trail.has(nodeId)) return '';
      const node = nodes.get(nodeId);
      if (!node) return '';
      const children = internalChildren(nodeId, ids);
      const childHtml = children.map(function (childId) { return renderInternalNode(childId, ids, new Set([...trail, nodeId])); }).join('');
      return '<div class="internal-node"><span class="internal-relation">contient</span>' + graphCard(node) + childHtml + '</div>';
    }
    function componentChildrenForUsage(ownerId, ids, usage) {
      return (outgoing.get(ownerId) || []).filter(function (edge) {
        const edgeUsage = edge.details && edge.details.usage;
        const matchesUsage = !edgeUsage || String(edgeUsage).split('+').indexOf(usage) >= 0;
        return edge.kind === 'contains' && matchesUsage && ids.has(edge.to) && nodes.has(edge.to);
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
        if (fromOwner && fromOwner === toOwner) return;
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

function collectServices(builder: GraphBuilder, sourceFiles: readonly SourceFile[]): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getText() !== 'craftService') continue;
      const config = call.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
      const name = getStringProperty(config, 'name') ?? inferNameFromServiceDeclaration(call);
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
          outputProperties: [],
        },
      });
      const service: ServiceInfo = {
        node,
        helpers: new Set(),
        call,
        outputPropertyNames: new Set(),
      };
      const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
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
        .map((helper) => call.getType().getProperty(helper)?.getTypeAtLocation(call))
        .map((type) => getServiceHelperOutputType(type))
        .find((type) => type !== undefined);
      for (const property of service.outputType?.getProperties() ?? []) {
        service.outputPropertyNames.add(property.getName());
      }
      if (node.details) {
        node.details['outputProperties'] = [...service.outputPropertyNames];
      }
      builder.services.push(service);
    }
  }
}

function collectSources(builder: GraphBuilder, sourceFiles: readonly SourceFile[]): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const creator = call.getExpression().getText();
      if (!SOURCE_CREATORS.has(creator)) continue;
      const name = getStringArgument(call, 0) ?? creator;
      const variableNames = new Set<string>();
      const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      if (declaration) addBindingNames(declaration.getNameNode(), variableNames);
      const node = addNode(builder, {
        id: `source:${sourceFile.getFilePath()}:${name}:${call.getStartLineNumber()}`,
        kind: 'source',
        label: `${name} (${creator})`,
        filePath: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
        details: { creator },
      });
      builder.sources.push({ node, variableNames });
    }
  }
}

function collectComponents(builder: GraphBuilder, sourceFiles: readonly SourceFile[]): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
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
      const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
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

function collectRoutes(builder: GraphBuilder, sourceFiles: readonly SourceFile[]): void {
  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getText() !== 'craftRoutes') continue;
      const collectionName = getStringArgument(call, 0) ?? sourceFile.getBaseNameWithoutExtension();
      const routes = call.getArguments()[1]?.asKind(SyntaxKind.ArrayLiteralExpression);
      if (!routes) continue;
      const routeInfos: RouteInfo[] = [];
      for (const element of routes.getElements()) {
        const routeCall = element.asKind(SyntaxKind.CallExpression);
        const object =
          element.asKind(SyntaxKind.ObjectLiteralExpression) ??
          (routeCall?.getExpression().getText() === 'craftRoute'
            ? routeCall.getArguments()[1]?.asKind(SyntaxKind.ObjectLiteralExpression)
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
            details: { collection: collectionName, path },
          }),
          sourceFile,
          object,
        };
        routeInfos.push(route);
        analyzeRouteObject(builder, route);
      }
      builder.routeFiles.set(sourceFile.getFilePath(), routeInfos);
    }
  }
}

function analyzeServiceBodies(builder: GraphBuilder): void {
  for (const service of builder.services) {
    const factory = service.call.getArguments()[1];
    if (!factory) continue;
    for (const call of factory.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const httpClientUsage = findCraftHttpClientUsage(call);
      if (httpClientUsage) {
        const ownerPrimitive = nearestPrimitiveCall(call);
        const ownerPrimitiveName = ownerPrimitive && primitiveName(ownerPrimitive);
        const ownerNode =
          ownerPrimitive && ownerPrimitiveName
            ? addPrimitiveNode(
                builder,
                ownerPrimitive,
                ownerPrimitiveName,
                service.node.id,
              )
            : service.node;
        addHttpClientUsage(builder, ownerNode.id, httpClientUsage);
      }
      const helper = findServiceForCall(builder, call);
      if (helper && helper !== service) {
        addEdge(builder, service.node.id, helper.node.id, 'depends-on', 'type');
        addServiceDependency(builder, service.node.id, helper, call);
      }
      const primitive = primitiveName(call);
      if (primitive) {
        const primitiveNode = addPrimitiveNode(builder, call, primitive, service.node.id);
        addEdge(builder, service.node.id, primitiveNode.id, 'contains', 'ast');
      }
    }
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
      for (const nested of part.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const httpClientUsage = findCraftHttpClientUsage(nested);
        if (httpClientUsage) {
          const ownerPrimitive = nearestPrimitiveCall(nested);
          const ownerPrimitiveName = ownerPrimitive && primitiveName(ownerPrimitive);
          const ownerNode =
            ownerPrimitive && ownerPrimitiveName
              ? addPrimitiveNode(
                  builder,
                  ownerPrimitive,
                  ownerPrimitiveName,
                  component.node.id,
                )
              : component.node;
          addHttpClientUsage(builder, ownerNode.id, httpClientUsage);
        }
        const helper =
          findServiceForCall(builder, nested) ??
          findComponentBoundService(component, nested);
        if (helper) {
          addEdge(builder, component.node.id, helper.node.id, 'depends-on', 'type');
          addServiceDependency(builder, component.node.id, helper, nested);
          if (!nearestPrimitiveCall(nested)) {
            collectServiceBindings(component, nested, helper);
          }
        }
        const primitive = primitiveName(nested);
        if (primitive) {
          const primitiveNode = addPrimitiveNode(builder, nested, primitive, component.node.id);
          addEdge(builder, component.node.id, primitiveNode.id, 'contains', 'ast', {
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
    collectServicePropertyUses(builder, component);
  }
}

function analyzeRoutes(builder: GraphBuilder): void {
  for (const routeInfos of builder.routeFiles.values()) {
    for (const route of routeInfos) {
      const imports = findDynamicImportSpecifiers(route.object);
      for (const specifier of imports) {
        const target = resolveImportedSource(route.sourceFile, specifier, builder.project);
        if (!target) continue;
        for (const component of builder.components.filter(
          (candidate) => candidate.node.filePath === target.getFilePath(),
        )) {
          addEdge(builder, route.node.id, component.node.id, 'loads', 'ast');
        }
        for (const childRoute of builder.routeFiles.get(target.getFilePath()) ?? []) {
          addEdge(builder, route.node.id, childRoute.node.id, 'loads', 'ast');
        }
      }
      for (const property of route.object.getProperties()) {
        if (!Node.isPropertyAssignment(property)) continue;
        const name = property.getName();
        if (!['canActivate', 'canMatch', 'resolve', 'queryParams', 'handleExceptions'].includes(name)) {
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
  // Route loading is resolved in a second pass after all route collections and components exist.
  for (const property of route.object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) continue;
    const propertyName = property.getName();
    if (propertyName === 'providers') {
      for (const call of property.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const helper = findServiceForCall(builder, call);
        if (helper) addEdge(builder, route.node.id, helper.node.id, 'depends-on', 'type');
      }
    }
  }
}

function collectServiceBindings(
  component: ComponentInfo,
  serviceCall: CallExpression,
  service: ServiceInfo,
): void {
  const yieldExpression = serviceCall.getFirstAncestorByKind(SyntaxKind.YieldExpression);
  const declaration = yieldExpression?.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (declaration) {
    for (const name of getBindingNames(declaration.getNameNode())) component.bindings.set(name, service);
  }
  const property = yieldExpression?.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
  if (property) component.bindings.set(property.getName(), service);
}

function collectServiceBindingsFromReturns(
  component: ComponentInfo,
  part: Node,
  builder: GraphBuilder,
): void {
  for (const yieldExpression of part.getDescendantsOfKind(SyntaxKind.YieldExpression)) {
    const expression = yieldExpression.getExpression();
    const call = expression?.asKind(SyntaxKind.CallExpression);
    if (!call) continue;
    if (nearestPrimitiveCall(call)) continue;
    const service = findServiceForCall(builder, call);
    if (service) collectServiceBindings(component, call, service);
  }
}

function collectServicePropertyUses(builder: GraphBuilder, component: ComponentInfo): void {
  const parts = [
    [component.call.getArguments()[2], 'setup'],
    [component.call.getArguments()[3], 'template'],
  ] as const;
  for (const [part, usage] of parts) {
    if (!part) continue;
    for (const access of part.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
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
        const propertyPath = chain.slice(1, chain.indexOf(propertyName) + 1).join('.');
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
        addEdge(builder, component.node.id, propertyNode.id, 'uses-property', 'type', {
          property: propertyName,
          usage,
        });
        parentId = propertyNode.id;
        currentType = propertyType;
      }
    }
  }
}

function addSourceInteractions(builder: GraphBuilder, ownerId: string, node: Node): void {
  for (const source of builder.sources) {
    for (const name of source.variableNames) {
      for (const access of node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
        const text = access.getText();
        if (!text.startsWith(`${name}.`)) continue;
        if (text.endsWith('.emit') || text.endsWith('.set')) {
          addEdge(builder, ownerId, source.node.id, 'writes', 'ast', { operation: text.split('.').pop() });
        } else if (text.endsWith('.subscribe') || text.endsWith('.asReadonly')) {
          addEdge(builder, ownerId, source.node.id, 'subscribes', 'ast');
        } else {
          addEdge(builder, ownerId, source.node.id, 'reads', 'ast');
        }
      }
      for (const call of node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expression = call.getExpression().getText();
        if (expression !== 'on$' && expression !== 'afterRecomputation') continue;
        if (call.getArguments()[0]?.getText() === name) {
          const primitive = nearestPrimitiveCall(call);
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

function primitiveNodeId(builder: GraphBuilder, call: CallExpression): string {
  const owner = call.getFirstAncestorByKind(SyntaxKind.CallExpression);
  const ownerText = owner?.getExpression().getText();
  const primitive = primitiveName(owner ?? call) ?? ownerText ?? 'primitive';
  const sourceFile = call.getSourceFile();
  return `primitive:${sourceFile.getFilePath()}:${primitive}:${owner?.getStartLineNumber() ?? call.getStartLineNumber()}`;
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
): void {
  const node = builder.nodes.get(nodeId);
  if (!node) return;
  node.details = {
    ...(node.details ?? {}),
    craftHttpClient: true,
    httpEndpoints: mergeHttpEndpoints(node.details?.['httpEndpoints'], usage),
  };
}

function mergeHttpEndpoints(
  previous: unknown,
  next: CraftHttpClientUsage,
): CraftHttpClientUsage[] {
  const endpoints = Array.isArray(previous)
    ? previous.filter(isHttpEndpoint)
    : [];
  if (!endpoints.some((endpoint) =>
    endpoint.method === next.method &&
    endpoint.url === next.url &&
    endpoint.line === next.line,
  )) {
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

function findCraftHttpClientUsage(
  call: CallExpression,
): CraftHttpClientUsage | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  const root = rootIdentifier(expression)?.getText();
  if (root !== 'CraftHttpClient' && root !== 'craftHttpClient') return undefined;

  const methodName = expression.getName();
  if (!CRAFT_HTTP_CLIENT_METHODS.has(methodName)) return undefined;

  const config = getHttpClientConfig(call);
  const url =
    getStaticExpressionText(config?.getProperty('url')
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()) ?? getStringArgument(call, 0);
  if (!url) return undefined;

  const configuredMethod = getStaticExpressionText(
    config?.getProperty('method')
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
  const directConfig = firstArgument?.asKind(SyntaxKind.ObjectLiteralExpression);
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
  const callableProperty = call
    .getAncestors()
    .find((ancestor) => {
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

  const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const declarationName = declaration?.getNameNode();
  return declarationName && Node.isIdentifier(declarationName)
    ? declarationName.getText()
    : undefined;
}

function addServiceDependency(
  builder: GraphBuilder,
  aggregateOwnerId: string,
  service: ServiceInfo,
  call: CallExpression,
): void {
  const ownerPrimitive = nearestPrimitiveCall(call);
  const ownerPrimitiveName = ownerPrimitive && primitiveName(ownerPrimitive);
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
    addEdge(builder, dependencyOwnerId, memberNode.id, 'depends-on', 'type', {
      member: memberPath,
      access: 'call',
    });
    return;
  }
  addEdge(builder, dependencyOwnerId, service.node.id, 'depends-on', 'type');
}

function nearestPrimitiveCall(call: CallExpression): CallExpression | undefined {
  let current: Node | undefined = call.getParent();
  while (current) {
    if (Node.isCallExpression(current) && primitiveName(current)) return current;
    current = current.getParent();
  }
  return undefined;
}

function primitiveName(call: CallExpression): string | undefined {
  const name = call.getExpression().getText();
  return PRIMITIVES.has(name) ? name : undefined;
}

function getServiceHelperOutputType(type: import('ts-morph').Type | undefined) {
  const signature = type?.getCallSignatures()[0];
  const returnType = signature?.getReturnType();
  const typeArguments = returnType?.getTypeArguments();
  return typeArguments && typeArguments.length >= 2 ? typeArguments[1] : undefined;
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
  const byName = builder.componentsByVariableName.get(expression.getText()) ?? [];
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

function findBindingNameNode(node: Node | undefined, name: string): Node | undefined {
  if (!node) return undefined;
  if (Node.isIdentifier(node)) return node.getText() === name ? node : undefined;
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

function symbolKey(symbol: import('ts-morph').Symbol | undefined): string | undefined {
  if (!symbol) return undefined;
  const resolved = symbol.getAliasedSymbol() ?? symbol;
  const declaration = resolved.getDeclarations()[0] ?? symbol.getDeclarations()[0];
  return declaration
    ? `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`
    : `symbol:${resolved.getFullyQualifiedName()}`;
}

function propertyAccessChain(access: PropertyAccessExpression): string[] | undefined {
  const parts: string[] = [access.getName()];
  let expression = access.getExpression();
  while (Node.isPropertyAccessExpression(expression)) {
    parts.unshift(expression.getName());
    expression = expression.getExpression();
  }
  return Node.isIdentifier(expression) ? [expression.getText(), ...parts] : undefined;
}

function findDynamicImportSpecifiers(node: Node): string[] {
  return node
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getText() === 'import')
    .map((call) => getStringArgument(call, 0))
    .filter((value): value is string => value !== undefined);
}

function resolveImportedSource(sourceFile: SourceFile, specifier: string, project: Project): SourceFile | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(sourceFile.getDirectoryPath(), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')];
  return candidates
    .map((candidate) => project.getSourceFile(candidate))
    .find((candidate): candidate is SourceFile => candidate !== undefined);
}

function addNode(builder: GraphBuilder, node: DependencyGraphNode): DependencyGraphNode {
  const existing = builder.nodes.get(node.id);
  if (existing) return existing;
  builder.nodes.set(node.id, node);
  return node;
}

function addEdge(
  builder: GraphBuilder,
  from: string,
  to: string,
  kind: DependencyGraphEdgeKind,
  evidence: 'ast' | 'type',
  details?: Record<string, unknown>,
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
    }
    return;
  }
  builder.edges.set(key, { from, to, kind, evidence, details });
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
  return [...new Set([String(previous), String(next)].flatMap((value) => value.split('+')))]
    .sort()
    .join('+');
}

function getStringArgument(call: CallExpression, index: number): string | undefined {
  return call.getArguments()[index]?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
}

function getStringProperty(
  object: ObjectLiteralExpression | undefined,
  name: string,
): string | undefined {
  return object?.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()
    ?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
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
    return node.getElements().flatMap((element) =>
      Node.isBindingElement(element) ? getBindingNames(element.getNameNode()) : [],
    );
  }
  return [];
}

function inferNameFromServiceDeclaration(call: CallExpression): string | undefined {
  const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
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
  return value.split('"').join('\\"').split('|').join('/').split('\n').join(' ');
}
