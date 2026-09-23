import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { graphHash } from './architecture-graph.js';
import type {
  DependencyGraph,
  DependencyGraphEdge,
  DependencyGraphNode,
  DependencyGraphProof,
} from './dependency-graph.js';

export type OrganizerScope =
  | 'feature-local'
  | 'parent-shared'
  | 'global-shared'
  | 'core'
  | 'unresolved';

export type OrganizerEvidence = 'ast' | 'type' | 'import';

export type GraphProof = DependencyGraphProof;

export type FileNode = {
  id: string;
  sourcePath: string;
  craftNodeIds: string[];
  craftKinds: string[];
  routeAnchors: string[];
  metrics: {
    fanIn: number;
    fanOut: number;
    routeSpan: number;
  };
};

export type FileEdge = {
  from: string;
  to: string;
  relationKinds: string[];
  evidence: OrganizerEvidence[];
  weight: number;
  proofs: GraphProof[];
};

export type OrganizerWeights = {
  loads: number;
  provides: number;
  checks: number;
  dependsOn: number;
  renders: number;
  calls: number;
  propertyUsage: number;
  imports: number;
  contains: number;
};

export const DEFAULT_ORGANIZER_WEIGHTS: OrganizerWeights = {
  loads: 6,
  provides: 5,
  checks: 5,
  dependsOn: 4,
  renders: 4,
  calls: 3,
  propertyUsage: 2,
  imports: 0.25,
  contains: 0,
};

export type OrganizerThresholds = {
  /** Deepest `features/…` folder a proposal creates. */
  maxDepth: number;
  hubFanIn: number;
  hubFanOut: number;
};

export const DEFAULT_ORGANIZER_THRESHOLDS: OrganizerThresholds = {
  maxDepth: 3,
  hubFanIn: 6,
  hubFanOut: 6,
};

export type OrganizerGraphStoreOptions = {
  rootDir: string;
  graphFile: string;
  tsConfigFilePath: string;
};

export type OrganizerGraphFreshness = {
  stale: boolean | 'unknown';
  newestSource?: string;
};

export type LoadedOrganizerGraph = {
  graph: DependencyGraph;
  builtAt: number;
};

/**
 * Read-only graph store used by the organizer. The organizer deliberately has
 * no rebuild path: graph production remains an explicit `craft graph` step.
 */
export class GraphStore {
  readonly options: OrganizerGraphStoreOptions;
  #loaded: LoadedOrganizerGraph | undefined;
  #programFiles: readonly string[] | undefined;

  constructor(options: OrganizerGraphStoreOptions) {
    this.options = options;
  }

  get(): LoadedOrganizerGraph {
    this.#loaded ??= this.#load();
    return this.#loaded;
  }

  freshness(): OrganizerGraphFreshness {
    const { builtAt } = this.get();
    if (!existsSync(this.options.tsConfigFilePath)) {
      return { stale: 'unknown' };
    }
    this.#programFiles ??= [
      this.options.tsConfigFilePath,
      ...programFiles(this.options.tsConfigFilePath),
    ];
    let newest: { path: string; mtime: number } | undefined;
    for (const path of this.#programFiles) {
      try {
        const mtime = statSync(path).mtimeMs;
        if (!newest || mtime > newest.mtime) newest = { path, mtime };
      } catch {
        // A deleted source is reported by the graph diagnostics; it should not
        // make freshness checking itself fail.
      }
    }
    return newest && newest.mtime > builtAt + 5
      ? { stale: true, newestSource: newest.path }
      : { stale: false };
  }

  #load(): LoadedOrganizerGraph {
    if (!existsSync(this.options.graphFile)) {
      throw new Error(
        `craft organize: graph file not found at ${this.options.graphFile}. Run craft graph explicitly first.`,
      );
    }
    let graph: unknown;
    try {
      graph = JSON.parse(
        readFileSync(this.options.graphFile, 'utf8'),
      ) as unknown;
    } catch (error) {
      throw new Error(
        `craft organize: cannot read graph ${this.options.graphFile}: ${String(error)}`,
      );
    }
    if (
      !graph ||
      typeof graph !== 'object' ||
      (graph as { version?: unknown }).version !== 1 ||
      !Array.isArray((graph as { nodes?: unknown }).nodes) ||
      !Array.isArray((graph as { edges?: unknown }).edges)
    ) {
      throw new Error(
        `craft organize: ${this.options.graphFile} is not a CraftTS dependency graph (version 1).`,
      );
    }
    return {
      graph: graph as DependencyGraph,
      builtAt: statSync(this.options.graphFile).mtimeMs,
    };
  }
}

export type FilePlacement = {
  sourcePath: string;
  proposedPath: string | null;
  scope: OrganizerScope;
  communityId: string | null;
  routeAnchors: string[];
  confidence: number;
  reasons: string[];
  relatedFiles: string[];
  alternatives: string[];
  action: 'move' | 'review' | 'keep-at-root';
};

export type OrganizerCommunity = {
  id: string;
  name: string;
  scope: OrganizerScope;
  fileIds: string[];
  depth: number;
  cohesion: number;
};

export type OrganizerDiagnostic = {
  code: string;
  message: string;
  file?: string;
  proof?: GraphProof;
};

export type FolderLayoutAnalysis = {
  version: 1;
  sourceGraphHash: string;
  graph: {
    version: 1;
    rootDir: string;
    tsConfigFilePath: string;
    freshness: OrganizerGraphFreshness;
    nodeCount: number;
    edgeCount: number;
  };
  config: {
    project: string;
    graph: string;
    targetRoot: string;
    weights: OrganizerWeights;
    thresholds: OrganizerThresholds;
    hash: string;
  };
  inventory: string[];
  routes: readonly OrganizerRoute[];
  fileNodes: FileNode[];
  fileEdges: FileEdge[];
  hubs: string[];
  communities: OrganizerCommunity[];
  diagnostics: OrganizerDiagnostic[];
};

export type FolderLayoutProposal = {
  version: 1;
  sourceGraphHash: string;
  configHash: string;
  placements: FilePlacement[];
  statistics: {
    files: number;
    moves: number;
    reviews: number;
    unresolved: number;
    confidence: {
      high: number;
      medium: number;
      low: number;
    };
  };
};

export type OrganizerRoute = {
  nodeId: string;
  collection: string;
  path: string;
  anchor: string;
  parentNodeId: string | null;
  file: string | null;
};

export type OrganizeOptions = {
  rootDir?: string;
  project: string;
  graph: string;
  out: string;
  targetRoot?: string;
  weights?: Partial<OrganizerWeights>;
  thresholds?: Partial<OrganizerThresholds>;
};

export type OrganizeResult = {
  analysis: FolderLayoutAnalysis;
  proposal: FolderLayoutProposal;
  report: string;
  outputDir: string;
};

type InternalFile = FileNode & {
  absolutePath: string;
  nodeKinds: Set<string>;
  /** Feature keys (route paths) and/or the shell owner using this file. */
  owners: Set<string>;
  ownership: 'graph' | 'import' | 'none';
  /** Shell by name, app config or global/browser boundary declaration. */
  coreSeed: boolean;
  /** What the app config declares this file to be, if anything. */
  shellRole: 'root' | 'global-error' | 'route-load-error' | null;
};

const SHELL_ROLE_REASONS = {
  root: 'root component (provideCraftRootComponent)',
  'global-error': 'global error screen of the app config',
  'route-load-error': 'route load error screen of the app config',
} as const;

const relationWeight = (
  edge: DependencyGraphEdge,
  weights: OrganizerWeights,
): number => {
  switch (edge.kind) {
    case 'loads':
      return weights.loads;
    case 'provides':
      return weights.provides;
    case 'checks':
      return weights.checks;
    case 'depends-on':
      return weights.dependsOn;
    case 'renders':
      return weights.renders;
    case 'calls':
      return weights.calls;
    case 'uses-property':
      return weights.propertyUsage;
    case 'contains':
      return weights.contains;
    default:
      return Math.min(weights.propertyUsage, 2);
  }
};

const posix = (path: string): string => path.split('\\').join('/');

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const shortHash = (value: unknown): string =>
  createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
    .slice(0, 16);

function programFiles(tsConfigFilePath: string): readonly string[] {
  const read = ts.readConfigFile(tsConfigFilePath, ts.sys.readFile);
  if (read.error) return [];
  return ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(tsConfigFilePath),
  ).fileNames;
}

function loadTsConfig(tsConfigFilePath: string): ts.ParsedCommandLine {
  const read = ts.readConfigFile(tsConfigFilePath, ts.sys.readFile);
  if (read.error) {
    throw new Error(
      `craft organize: invalid tsconfig ${tsConfigFilePath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(tsConfigFilePath),
  );
  const errors = parsed.errors.filter(
    (error) => error.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(
      `craft organize: cannot resolve ${tsConfigFilePath}: ${errors
        .map((error) =>
          ts.flattenDiagnosticMessageText(error.messageText, '\n'),
        )
        .join('; ')}`,
    );
  }
  return parsed;
}

function isFrontendFile(file: string): boolean {
  const normalized = posix(file).toLowerCase();
  return (
    !normalized.endsWith('.d.ts') &&
    !/(^|\/)(generated|server|backend)(\/|$)/.test(normalized) &&
    !/\.(spec|test)\.[cm]?[jt]sx?$/.test(normalized) &&
    !normalized.endsWith('.stories.ts')
  );
}

function relativeSource(rootDir: string, file: string): string {
  return posix(relative(rootDir, file) || '.');
}

function relativeProof(rootDir: string, proof: GraphProof): GraphProof {
  return {
    ...proof,
    filePath: relativeSource(rootDir, resolve(proof.filePath)),
  };
}

function portableGraphText(rootDir: string, text: string): string {
  return text.split(rootDir).join('.');
}

function canonicalEdges(edges: readonly FileEdge[]): FileEdge[] {
  return [...edges]
    .map((edge) => ({
      ...edge,
      relationKinds: [...new Set(edge.relationKinds)].sort(),
      evidence: [...new Set(edge.evidence)].sort() as OrganizerEvidence[],
      proofs: [...edge.proofs].sort((a, b) =>
        stableStringify(a).localeCompare(stableStringify(b)),
      ),
    }))
    .sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

function addFileEdge(
  edgeMap: Map<string, FileEdge>,
  from: string,
  to: string,
  kind: string,
  evidence: OrganizerEvidence,
  weight: number,
  proof?: GraphProof,
): void {
  if (from === to) return;
  const key = `${from}\0${to}`;
  const current = edgeMap.get(key) ?? {
    from,
    to,
    relationKinds: [],
    evidence: [],
    weight: 0,
    proofs: [],
  };
  if (!current.relationKinds.includes(kind)) current.relationKinds.push(kind);
  if (!current.evidence.includes(evidence)) current.evidence.push(evidence);
  current.weight += weight;
  if (
    proof &&
    !current.proofs.some(
      (candidate) => stableStringify(candidate) === stableStringify(proof),
    )
  ) {
    current.proofs.push(proof);
  }
  edgeMap.set(key, current);
}

function resolveImports(
  sourceFile: ts.SourceFile,
  compilerOptions: ts.CompilerOptions,
  inventory: Set<string>,
): string[] {
  const imports: string[] = [];
  const specifiers = [
    ...sourceFile
      .getFullText()
      .matchAll(
        /(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      ),
  ]
    .map((match) => match[1] ?? match[2])
    .filter((specifier): specifier is string => specifier !== undefined);
  for (const specifierText of specifiers) {
    const resolved = ts.resolveModuleName(
      specifierText,
      sourceFile.fileName,
      compilerOptions,
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    if (resolved && inventory.has(resolve(resolved)))
      imports.push(resolve(resolved));
  }
  return imports.sort();
}

/**
 * Owner key standing for the application shell: bootstrap entry, `app.*`
 * files, app config and everything only they reach.
 */
const CORE_OWNER = '#core';

/**
 * Relations read as "`from` uses `to`": `to` then belongs to every feature
 * that owns `from`. `checks` (compile-time route checks) and `triggers`
 * (reactive wiring inside one owner) carry no ownership.
 */
const OWNERSHIP_RELATIONS = new Set([
  'loads',
  'provides',
  'depends-on',
  'renders',
  'calls',
  'uses-property',
  'contains',
  'reads',
]);

const ROUTING_KINDS = new Set(['route', 'route-hook', 'route-check']);

/** Bundler entry points: they stay where the build configuration expects them. */
function isEntryFile(sourcePath: string): boolean {
  return /^main(\.[\w-]+)?\.[cm]?[jt]sx?$/.test(basename(sourcePath));
}

/** `main.ts`, `app.ts`, `app.config.ts`, `app.routes.ts`, `app-shell.ts`… */
function isShellFile(sourcePath: string): boolean {
  return isEntryFile(sourcePath) || /^app[.-]/.test(basename(sourcePath));
}

/** Route path → feature folder segments; route params and wildcards are not folders. */
function featureSegments(path: string): string[] {
  return path
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(':') && !part.includes('*'))
    .map(slug);
}

const featureKey = (segments: readonly string[]): string =>
  segments.join('/') || 'home';

/**
 * Anchors every route on its full feature path. A collection loaded by a
 * route of another collection inherits that route's path as a prefix; the
 * collection name itself is never a folder (it names a routes table).
 */
function projectRoutes(
  graph: DependencyGraph,
  rootDir: string,
): OrganizerRoute[] {
  const routeNodes = graph.nodes
    .filter((node) => node.kind === 'route')
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(routeNodes.map((node) => [node.id, node]));
  const collectionOf = (node: DependencyGraphNode): string =>
    String(node.details?.['collection'] ?? 'routes');
  const parentOfCollection = new Map<string, string>();
  for (const edge of [...graph.edges].sort((a, b) =>
    `${a.from}\0${a.to}`.localeCompare(`${b.from}\0${b.to}`),
  )) {
    if (edge.kind !== 'loads') continue;
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const collection = collectionOf(to);
    if (
      collection !== collectionOf(from) &&
      !parentOfCollection.has(collection)
    )
      parentOfCollection.set(collection, from.id);
  }
  const segmentsOf = new Map<string, string[]>();
  const resolveSegments = (
    node: DependencyGraphNode,
    visiting: ReadonlySet<string>,
  ): string[] => {
    const cached = segmentsOf.get(node.id);
    if (cached) return cached;
    const parentId = parentOfCollection.get(collectionOf(node));
    const parent =
      parentId && !visiting.has(parentId) ? byId.get(parentId) : undefined;
    const prefix = parent
      ? resolveSegments(parent, new Set([...visiting, node.id]))
      : [];
    const segments = [
      ...prefix,
      ...featureSegments(String(node.details?.['path'] ?? '')),
    ];
    segmentsOf.set(node.id, segments);
    return segments;
  };
  return routeNodes.map((node) => {
    const collection = collectionOf(node);
    return {
      nodeId: node.id,
      collection,
      path: String(node.details?.['path'] ?? ''),
      anchor: featureKey(resolveSegments(node, new Set())),
      parentNodeId: parentOfCollection.get(collection) ?? null,
      file: node.filePath
        ? relativeSource(rootDir, resolve(node.filePath))
        : null,
    };
  });
}

function makeProjection(
  graph: DependencyGraph,
  rootDir: string,
  parsed: ts.ParsedCommandLine,
  weights: OrganizerWeights,
): {
  files: InternalFile[];
  edges: FileEdge[];
  routes: OrganizerRoute[];
  diagnostics: OrganizerDiagnostic[];
} {
  const files = parsed.fileNames
    .map((file) => resolve(file))
    .filter(isFrontendFile)
    .sort()
    .map(
      (absolutePath): InternalFile => ({
        id: `file:${relativeSource(rootDir, absolutePath)}`,
        sourcePath: relativeSource(rootDir, absolutePath),
        absolutePath,
        craftNodeIds: [],
        craftKinds: [],
        nodeKinds: new Set(),
        routeAnchors: [],
        metrics: { fanIn: 0, fanOut: 0, routeSpan: 0 },
        owners: new Set(),
        ownership: 'none',
        coreSeed: false,
        shellRole: null,
      }),
    );
  const byPath = new Map(files.map((file) => [file.absolutePath, file]));
  const byNode = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map<string, FileEdge>();
  const diagnostics: OrganizerDiagnostic[] = [];
  const routes = projectRoutes(graph, rootDir);

  for (const node of graph.nodes) {
    if (!node.filePath) continue;
    const owner = byPath.get(resolve(node.filePath));
    if (!owner) {
      if (isFrontendFile(resolve(node.filePath))) {
        diagnostics.push({
          code: 'GRAPH_FILE_OUTSIDE_PROJECT',
          message: `CraftTS node ${portableGraphText(rootDir, node.id)} points at a file outside the tsconfig inventory.`,
          file: relativeSource(rootDir, resolve(node.filePath)),
        });
      }
      continue;
    }
    owner.craftNodeIds.push(node.id);
    owner.craftKinds.push(node.kind);
    owner.nodeKinds.add(node.kind);
    if (
      node.kind === 'app-config' ||
      node.details?.['browserBoundary'] === true ||
      node.details?.['global'] === true
    )
      owner.coreSeed = true;
  }

  for (const file of files) {
    file.craftNodeIds = [...new Set(file.craftNodeIds)].sort();
    file.craftKinds = [...new Set(file.craftKinds)].sort();
    if (isShellFile(file.sourcePath)) file.coreSeed = true;
    if (file.craftNodeIds.length === 0) {
      diagnostics.push({
        code: 'FILE_WITHOUT_CRAFT_NODE',
        message:
          'File is part of the frontend tsconfig but has no CraftTS node.',
        file: file.sourcePath,
      });
    }
  }

  for (const edge of graph.edges) {
    const from = byNode.get(edge.from);
    const to = byNode.get(edge.to);
    const role = edge.details?.['role'];
    if (
      from?.kind === 'app-config' &&
      edge.kind === 'renders' &&
      to?.filePath &&
      (role === 'root' ||
        role === 'global-error' ||
        role === 'route-load-error')
    ) {
      const shell = byPath.get(resolve(to.filePath));
      if (shell && shell.shellRole !== 'root') {
        shell.shellRole = role;
        shell.coreSeed = true;
      }
    }
  }

  for (const edge of graph.edges) {
    const from = byNode.get(edge.from);
    const to = byNode.get(edge.to);
    if (!from?.filePath || !to?.filePath) continue;
    const fromFile = byPath.get(resolve(from.filePath));
    const toFile = byPath.get(resolve(to.filePath));
    if (!fromFile || !toFile) continue;
    addFileEdge(
      edgeMap,
      fromFile.id,
      toFile.id,
      edge.kind,
      edge.evidence,
      relationWeight(edge, weights),
      edge.proof ? relativeProof(rootDir, edge.proof) : undefined,
    );
  }

  const program = ts.createProgram({
    rootNames: files.map((file) => file.absolutePath),
    options: parsed.options,
  });
  const inventory = new Set(files.map((file) => file.absolutePath));
  for (const sourceFile of program.getSourceFiles()) {
    const from = byPath.get(resolve(sourceFile.fileName));
    if (!from || sourceFile.isDeclarationFile) continue;
    for (const imported of resolveImports(
      sourceFile,
      parsed.options,
      inventory,
    )) {
      const to = byPath.get(imported);
      if (to)
        addFileEdge(
          edgeMap,
          from.id,
          to.id,
          'imports',
          'import',
          weights.imports,
        );
    }
  }

  const fileEdges = canonicalEdges([...edgeMap.values()]);
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of fileEdges) {
    if (edge.relationKinds.includes('contains')) continue;
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  for (const file of files) {
    file.metrics.fanIn = incoming.get(file.id) ?? 0;
    file.metrics.fanOut = outgoing.get(file.id) ?? 0;
  }

  assignOwners(graph, files, routes, fileEdges, byPath);
  for (const file of files) {
    file.routeAnchors = [...file.owners]
      .filter((owner) => owner !== CORE_OWNER)
      .sort();
    file.metrics.routeSpan = file.routeAnchors.length;
  }
  return { files, edges: fileEdges, routes, diagnostics };
}

/**
 * Feature ownership, following usage direction only: a route owns what it
 * loads, and a node belongs to every owner of the nodes that use it. The
 * reverse never holds — being used by a route file does not make the route
 * file's other routes yours, which is what used to put every page in
 * `shared`. Imports only decide for files the CraftTS graph says nothing
 * about.
 */
function assignOwners(
  graph: DependencyGraph,
  files: readonly InternalFile[],
  routes: readonly OrganizerRoute[],
  fileEdges: readonly FileEdge[],
  byPath: ReadonlyMap<string, InternalFile>,
): void {
  const fileOfNode = new Map<string, InternalFile>();
  for (const node of graph.nodes) {
    const file = node.filePath ? byPath.get(resolve(node.filePath)) : undefined;
    if (file) fileOfNode.set(node.id, file);
  }
  const owners = new Map<string, Set<string>>();
  const add = (nodeId: string, owner: string): boolean => {
    const set = owners.get(nodeId) ?? new Set<string>();
    if (set.has(owner)) return false;
    set.add(owner);
    owners.set(nodeId, set);
    return true;
  };
  const routeKey = new Map(routes.map((route) => [route.nodeId, route.anchor]));
  for (const node of graph.nodes) {
    const key = routeKey.get(node.id);
    if (key !== undefined) {
      add(node.id, key);
      continue;
    }
    // Routes and their checks/hooks sit in the shell's routes file, but they
    // are owned by the route they belong to, not by the shell.
    if (ROUTING_KINDS.has(node.kind)) continue;
    if (
      node.kind === 'app-config' ||
      node.details?.['browserBoundary'] === true ||
      node.details?.['global'] === true ||
      (fileOfNode.get(node.id)?.coreSeed ?? false)
    )
      add(node.id, CORE_OWNER);
  }

  const uses = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!OWNERSHIP_RELATIONS.has(edge.kind)) continue;
    uses.set(edge.from, [...(uses.get(edge.from) ?? []), edge.to]);
  }
  const queue = [...owners.keys()].sort();
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index] as string;
    const from = [...(owners.get(id) ?? [])];
    for (const to of uses.get(id) ?? []) {
      let grew = false;
      for (const owner of from) grew = add(to, owner) || grew;
      if (grew) queue.push(to);
    }
  }

  for (const file of files) {
    for (const id of file.craftNodeIds)
      for (const owner of owners.get(id) ?? []) file.owners.add(owner);
    if (file.owners.size > 0) file.ownership = 'graph';
  }

  const filesById = new Map(files.map((file) => [file.id, file]));
  const importers = new Map<string, InternalFile[]>();
  for (const edge of fileEdges) {
    if (!edge.relationKinds.includes('imports')) continue;
    const importer = filesById.get(edge.from);
    if (importer)
      importers.set(edge.to, [...(importers.get(edge.to) ?? []), importer]);
  }
  // What an importer hands down: the shell hands down the shell only, never
  // the features its routes table happens to import.
  const handedDown = (importer: InternalFile): string[] =>
    importer.coreSeed || importer.owners.has(CORE_OWNER)
      ? [CORE_OWNER]
      : [...importer.owners];
  let changed = true;
  for (let pass = 0; changed && pass <= files.length; pass += 1) {
    changed = false;
    for (const file of files) {
      if (file.ownership === 'graph') continue;
      for (const importer of importers.get(file.id) ?? [])
        for (const owner of handedDown(importer)) {
          if (file.owners.has(owner)) continue;
          file.owners.add(owner);
          file.ownership = 'import';
          changed = true;
        }
    }
  }
}

function commonPrefix(paths: readonly (readonly string[])[]): string[] {
  const [first = [], ...rest] = paths;
  const prefix: string[] = [];
  for (const [index, segment] of first.entries()) {
    if (rest.some((path) => path[index] !== segment)) break;
    prefix.push(segment);
  }
  return prefix;
}

type ScopeDecision = {
  scope: OrganizerScope;
  /** Folder under `features/` for feature scopes. */
  featurePath: string[];
  reasons: string[];
};

/**
 * Feature first: a file lives in the deepest feature that contains every
 * feature using it. `shared/` only receives what several top-level features
 * use; `core/` receives the shell and what only the shell reaches.
 */
function classifyScope(file: InternalFile): ScopeDecision {
  const features = file.routeAnchors;
  const topLevel = [
    ...new Set(features.map((feature) => feature.split('/')[0] as string)),
  ].sort();
  if (file.shellRole)
    return {
      scope: 'core',
      featurePath: [],
      reasons: [SHELL_ROLE_REASONS[file.shellRole]],
    };
  if (isShellFile(file.sourcePath))
    return {
      scope: 'core',
      featurePath: [],
      reasons: ['application shell file (main/app.*)'],
    };
  if (file.coreSeed)
    return {
      scope: 'core',
      featurePath: [],
      reasons: ['declares app config or a global/browser boundary'],
    };
  if (file.owners.size === 0)
    return {
      scope: 'unresolved',
      featurePath: [],
      reasons: ['no route, shell or importer reaches this file'],
    };
  if (file.owners.has(CORE_OWNER))
    return {
      scope: 'core',
      featurePath: [],
      reasons: [
        features.length > 0
          ? `used by the application shell and by ${features.join(', ')}`
          : 'reached from the application shell only',
      ],
    };
  if (
    topLevel.length > 1 &&
    [...file.nodeKinds].some((kind) => ROUTING_KINDS.has(kind))
  )
    return {
      scope: 'core',
      featurePath: [],
      reasons: [`routing infrastructure spanning ${topLevel.join(', ')}`],
    };
  if (features.length === 1)
    return {
      scope: 'feature-local',
      featurePath: (features[0] as string).split('/'),
      reasons: [`used by feature ${features[0]} only`],
    };
  const paths = features.map((feature) => feature.split('/'));
  // Users on one lineage (`css-vars` and `css-vars/required`): the file is
  // the deepest one's, the ancestors reach into their own sub-feature. A
  // routes table stays with its parent route instead.
  const deepest = [...paths].sort((a, b) => b.length - a.length)[0] as string[];
  if (
    !file.nodeKinds.has('route') &&
    paths.every((path) => commonPrefix([path, deepest]).length === path.length)
  )
    return {
      scope: 'feature-local',
      featurePath: deepest,
      reasons: [
        `used by feature ${deepest.join('/')} and its ancestors ${features
          .filter((feature) => feature !== deepest.join('/'))
          .join(', ')}`,
      ],
    };
  const ancestor = commonPrefix(paths);
  if (ancestor.length > 0)
    return {
      scope: 'parent-shared',
      featurePath: ancestor,
      reasons: [
        `common ancestor feature ${ancestor.join('/')} of ${features.join(', ')}`,
      ],
    };
  return {
    scope: 'global-shared',
    featurePath: [],
    reasons: [`used across top-level features ${topLevel.join(', ')}`],
  };
}

function confidenceFor(scope: OrganizerScope, file: InternalFile): number {
  if (scope === 'unresolved') return 0.2;
  if (scope === 'core' && (isShellFile(file.sourcePath) || file.coreSeed))
    return 0.95;
  if (file.craftNodeIds.length === 0) return 0.25;
  if (file.ownership === 'import') return 0.45;
  if (scope === 'feature-local') return 0.92;
  if (scope === 'parent-shared') return 0.85;
  if (scope === 'core') return 0.85;
  return 0.78;
}

/** Folder (relative to the target root) a decision places a file in. */
function folderFor(
  decision: ScopeDecision,
  thresholds: OrganizerThresholds,
): string | null {
  if (decision.scope === 'unresolved') return null;
  if (decision.scope === 'core') return 'core';
  if (decision.scope === 'global-shared') return 'shared';
  return posix(
    join('features', ...decision.featurePath.slice(0, thresholds.maxDepth)),
  );
}

function slug(value: string): string {
  return (
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'shared'
  );
}

function partitionCohesion(
  fileIds: readonly string[],
  edges: readonly FileEdge[],
): number {
  const ids = new Set(fileIds);
  const internal = edges.filter(
    (edge) =>
      ids.has(edge.from) &&
      ids.has(edge.to) &&
      edge.weight > 0 &&
      !edge.relationKinds.includes('contains'),
  ).length;
  return Math.min(
    1,
    internal / Math.max(1, fileIds.length * Math.max(1, fileIds.length - 1)),
  );
}

function renderReport(
  analysis: FolderLayoutAnalysis,
  proposal: FolderLayoutProposal,
): string {
  const lines: string[] = [
    '# Folder layout proposal',
    '',
    `Source graph hash: \`${analysis.sourceGraphHash}\``,
    '',
    '## Proposed tree',
    '',
  ];
  const proposed = proposal.placements
    .filter((placement) => placement.proposedPath)
    .sort((a, b) => (a.proposedPath ?? '').localeCompare(b.proposedPath ?? ''));
  if (proposed.length === 0)
    lines.push('_No confident destination was found._', '');
  else {
    for (const placement of proposed)
      lines.push(
        `- \`${placement.proposedPath}\` — ${placement.scope} (${placement.confidence.toFixed(2)})`,
      );
    lines.push('');
  }
  lines.push('## File-by-file decisions', '');
  for (const placement of proposal.placements) {
    lines.push(
      `### \`${placement.sourcePath}\``,
      '',
      `- Action: **${placement.action}**`,
      `- Scope: **${placement.scope}**`,
      `- Destination: ${placement.proposedPath ? `\`${placement.proposedPath}\`` : '_unresolved_'}`,
      `- Confidence: **${placement.confidence.toFixed(2)}**`,
    );
    if (placement.routeAnchors.length > 0)
      lines.push(
        `- Route scopes: ${placement.routeAnchors.map((anchor) => `\`${anchor}\``).join(', ')}`,
      );
    if (placement.reasons.length > 0)
      lines.push(`- Reasons: ${placement.reasons.join('; ')}`);
    if (placement.relatedFiles.length > 0)
      lines.push(
        `- Related files: ${placement.relatedFiles.map((file) => `\`${file}\``).join(', ')}`,
      );
    lines.push('');
  }
  lines.push('## Hubs and diagnostics', '');
  lines.push(
    analysis.hubs.length
      ? `Hubs: ${analysis.hubs.map((hub) => `\`${hub}\``).join(', ')}`
      : 'No hubs detected.',
    '',
  );
  if (analysis.diagnostics.length === 0) lines.push('No diagnostics.', '');
  else
    for (const diagnostic of analysis.diagnostics)
      lines.push(
        `- **${diagnostic.code}**${diagnostic.file ? ` \`${diagnostic.file}\`` : ''}: ${diagnostic.message}`,
      );
  lines.push(
    '',
    '## Confidence statistics',
    '',
    `- High: ${proposal.statistics.confidence.high}`,
    `- Medium: ${proposal.statistics.confidence.medium}`,
    `- Low: ${proposal.statistics.confidence.low}`,
    `- Moves: ${proposal.statistics.moves}`,
    `- Reviews: ${proposal.statistics.reviews}`,
    `- Unresolved: ${proposal.statistics.unresolved}`,
    '',
  );
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function organizeProject(options: OrganizeOptions): OrganizeResult {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const project = resolve(rootDir, options.project);
  const graphFile = resolve(rootDir, options.graph);
  const parsed = loadTsConfig(project);
  const weights = { ...DEFAULT_ORGANIZER_WEIGHTS, ...(options.weights ?? {}) };
  const thresholds = {
    ...DEFAULT_ORGANIZER_THRESHOLDS,
    ...(options.thresholds ?? {}),
  };
  const targetRoot = posix(
    options.targetRoot ??
      (() => {
        const candidate = join(dirname(project), 'src');
        return existsSync(candidate)
          ? relative(rootDir, candidate)
          : relative(rootDir, dirname(project));
      })(),
  );
  const store = new GraphStore({
    rootDir,
    graphFile,
    tsConfigFilePath: project,
  });
  const loaded = store.get();
  const freshness = store.freshness();
  if (freshness.stale === true) {
    throw new Error(
      `craft organize: graph is stale; ${freshness.newestSource ?? 'a project source'} is newer than ${graphFile}. Run craft graph explicitly, then retry.`,
    );
  }
  if (freshness.stale === 'unknown') {
    throw new Error(
      `craft organize: graph freshness is unknown for ${project}; refusing to analyze.`,
    );
  }
  const projection = makeProjection(loaded.graph, rootDir, parsed, weights);
  const filesById = new Map(projection.files.map((file) => [file.id, file]));
  const decisions = new Map(
    projection.files.map((file) => [file.id, classifyScope(file)] as const),
  );
  const folders = new Map<
    string,
    { scope: OrganizerScope; fileIds: string[] }
  >();
  for (const file of projection.files) {
    const decision = decisions.get(file.id) as ScopeDecision;
    const folder = folderFor(decision, thresholds);
    if (folder === null) continue;
    const group = folders.get(folder) ?? { scope: decision.scope, fileIds: [] };
    group.fileIds.push(file.id);
    folders.set(folder, group);
  }
  // A community is a destination folder. Its identity is the folder, not the
  // source paths, so renaming a legacy folder keeps the proposal stable.
  const communities: OrganizerCommunity[] = [...folders.entries()]
    .map(([folder, group]) => ({
      id: `community:${shortHash(folder)}`,
      name: folder,
      scope: group.scope,
      fileIds: group.fileIds.sort(),
      depth: folder.split('/').length - 1,
      cohesion: partitionCohesion(group.fileIds, projection.edges),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const communityForFile = new Map(
    communities.flatMap((community) =>
      community.fileIds.map((fileId) => [fileId, community] as const),
    ),
  );
  const occupied = new Map<string, string>();
  const placements: FilePlacement[] = projection.files
    .map((file) => {
      const decision = decisions.get(file.id) as ScopeDecision;
      const { scope } = decision;
      const community = communityForFile.get(file.id);
      const base = basename(file.sourcePath);
      const proposedPath = isEntryFile(file.sourcePath)
        ? file.sourcePath
        : community
          ? posix(join(targetRoot, community.name, base))
          : null;
      const routeAnchors = [...file.routeAnchors].sort();
      const relatedFiles = projection.edges
        .filter((edge) => edge.from === file.id || edge.to === file.id)
        .sort((a, b) => b.weight - a.weight || a.from.localeCompare(b.from))
        .slice(0, 5)
        .map(
          (edge) =>
            filesById.get(edge.from === file.id ? edge.to : edge.from)
              ?.sourcePath,
        )
        .filter((path): path is string => path !== undefined);
      const reasons: string[] = [...decision.reasons];
      if (isEntryFile(file.sourcePath))
        reasons.push('bundler entry point stays in place');
      if (file.ownership === 'import')
        reasons.push('ownership inferred from importers only');
      if (file.nodeKinds.size > 0)
        reasons.push(`CraftTS kinds: ${[...file.nodeKinds].sort().join(', ')}`);
      if (file.craftNodeIds.length === 0)
        reasons.push('no CraftTS node; import evidence only');
      if (
        file.metrics.fanIn >= thresholds.hubFanIn ||
        file.metrics.fanOut >= thresholds.hubFanOut
      )
        reasons.push('hub');
      let action: FilePlacement['action'] = proposedPath
        ? 'move'
        : 'keep-at-root';
      const finalPath = proposedPath;
      if (finalPath) {
        const previous = occupied.get(finalPath);
        if (previous && previous !== file.id) {
          action = 'review';
          reasons.push(
            `destination collision with ${filesById.get(previous)?.sourcePath ?? previous}`,
          );
        } else occupied.set(finalPath, file.id);
      }
      const confidence = confidenceFor(scope, file);
      if (confidence < 0.5 && action === 'move') action = 'review';
      return {
        sourcePath: file.sourcePath,
        proposedPath: finalPath,
        scope,
        communityId: community?.id ?? null,
        routeAnchors,
        confidence,
        reasons,
        relatedFiles,
        alternatives:
          scope === 'parent-shared' && community
            ? [posix(join(targetRoot, community.name, 'shared', base))]
            : [],
        action,
      };
    })
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  for (const placement of placements) {
    if (
      placement.action === 'move' &&
      placement.proposedPath === placement.sourcePath
    )
      placement.action = 'keep-at-root';
  }
  const hubs = projection.files
    .filter(
      (file) =>
        file.metrics.fanIn >= thresholds.hubFanIn ||
        file.metrics.fanOut >= thresholds.hubFanOut,
    )
    .map((file) => file.sourcePath)
    .sort();
  const config = {
    project: relativeSource(rootDir, project),
    graph: relativeSource(rootDir, graphFile),
    targetRoot,
    weights,
    thresholds,
  };
  const configHash = shortHash(config);
  const analysis: FolderLayoutAnalysis = {
    version: 1,
    sourceGraphHash: graphHash(loaded.graph),
    graph: {
      version: 1,
      rootDir: '.',
      tsConfigFilePath: relativeSource(rootDir, project),
      freshness,
      nodeCount: loaded.graph.nodes.length,
      edgeCount: loaded.graph.edges.length,
    },
    config: { ...config, hash: configHash },
    inventory: projection.files.map((file) => file.sourcePath).sort(),
    routes: projection.routes.map((route) => ({
      ...route,
      nodeId: portableGraphText(rootDir, route.nodeId),
      parentNodeId: route.parentNodeId
        ? portableGraphText(rootDir, route.parentNodeId)
        : null,
    })),
    fileNodes: projection.files
      .map(
        ({ absolutePath: _absolutePath, nodeKinds: _nodeKinds, ...file }) => ({
          ...file,
          craftNodeIds: file.craftNodeIds.map((id) =>
            portableGraphText(rootDir, id),
          ),
        }),
      )
      .sort((a, b) => a.id.localeCompare(b.id)),
    fileEdges: projection.edges,
    hubs,
    communities,
    diagnostics: [
      ...(loaded.graph.diagnostics ?? []).map((diagnostic) => ({
        code: diagnostic.code,
        message: portableGraphText(rootDir, diagnostic.message),
        ...(diagnostic.proof
          ? {
              file: relativeSource(rootDir, resolve(diagnostic.proof.filePath)),
              proof: relativeProof(rootDir, diagnostic.proof),
            }
          : {}),
      })),
      ...projection.diagnostics,
    ].sort((a, b) =>
      `${a.code}:${a.file ?? ''}`.localeCompare(`${b.code}:${b.file ?? ''}`),
    ),
  };
  const statistics = {
    files: placements.length,
    moves: placements.filter((placement) => placement.action === 'move').length,
    reviews: placements.filter((placement) => placement.action === 'review')
      .length,
    unresolved: placements.filter(
      (placement) => placement.scope === 'unresolved',
    ).length,
    confidence: {
      high: placements.filter((placement) => placement.confidence >= 0.8)
        .length,
      medium: placements.filter(
        (placement) =>
          placement.confidence >= 0.5 && placement.confidence < 0.8,
      ).length,
      low: placements.filter((placement) => placement.confidence < 0.5).length,
    },
  };
  const proposal: FolderLayoutProposal = {
    version: 1,
    sourceGraphHash: analysis.sourceGraphHash,
    configHash,
    placements,
    statistics,
  };
  const report = renderReport(analysis, proposal);
  const outputDir = resolve(rootDir, options.out);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'folder-layout-analysis.json'),
    `${JSON.stringify(analysis, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    join(outputDir, 'folder-layout-proposal.json'),
    `${JSON.stringify(proposal, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(join(outputDir, 'FOLDER_LAYOUT_REPORT.md'), report, 'utf8');
  return { analysis, proposal, report, outputDir };
}
