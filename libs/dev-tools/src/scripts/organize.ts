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
  maxIterations: number;
  maxDepth: number;
  minCommunitySize: number;
  minCohesion: number;
  hubFanIn: number;
  hubFanOut: number;
};

export const DEFAULT_ORGANIZER_THRESHOLDS: OrganizerThresholds = {
  maxIterations: 12,
  maxDepth: 3,
  minCommunitySize: 3,
  minCohesion: 0.2,
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

export type ArchitectureAnalysis = {
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

export type ArchitectureProposal = {
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
  analysis: ArchitectureAnalysis;
  proposal: ArchitectureProposal;
  report: string;
  outputDir: string;
};

type InternalFile = FileNode & {
  absolutePath: string;
  nodeKinds: Set<string>;
};

type ScopeScore = Map<string, number>;

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

function nodeFile(
  node: DependencyGraphNode,
  rootDir: string,
): string | undefined {
  return node.filePath ? resolve(node.filePath) : undefined;
}

function routeAnchor(
  node: DependencyGraphNode,
  rootDir: string,
): OrganizerRoute | undefined {
  if (node.kind !== 'route') return undefined;
  const details = node.details ?? {};
  const collection = String(details['collection'] ?? 'routes');
  const path = String(details['path'] ?? '');
  const pathParts = path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^[:*]/, 'param'));
  const anchor = [collection, ...pathParts].join('/');
  return {
    nodeId: node.id,
    collection,
    path,
    anchor,
    parentNodeId: null,
    file: node.filePath
      ? relativeSource(rootDir, resolve(node.filePath))
      : null,
  };
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

function makeProjection(
  graph: DependencyGraph,
  rootDir: string,
  parsed: ts.ParsedCommandLine,
  weights: OrganizerWeights,
): {
  files: InternalFile[];
  edges: FileEdge[];
  routes: OrganizerRoute[];
  routeScores: Map<string, ScopeScore>;
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
      }),
    );
  const byPath = new Map(files.map((file) => [file.absolutePath, file]));
  const byNode = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map<string, FileEdge>();
  const diagnostics: OrganizerDiagnostic[] = [];
  const routes = graph.nodes
    .map((node) => routeAnchor(node, rootDir))
    .filter((route): route is OrganizerRoute => route !== undefined)
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  for (const route of routes) {
    const routeNode = byNode.get(route.nodeId);
    if (!routeNode?.filePath) continue;
    const owner = byPath.get(resolve(routeNode.filePath));
    if (owner) {
      owner.routeAnchors.push(route.anchor);
      owner.craftNodeIds.push(routeNode.id);
      owner.craftKinds.push(routeNode.kind);
      owner.nodeKinds.add(routeNode.kind);
    }
  }

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
  }

  for (const file of files) {
    file.craftNodeIds = [...new Set(file.craftNodeIds)].sort();
    file.craftKinds = [...new Set(file.craftKinds)].sort();
    file.routeAnchors = [...new Set(file.routeAnchors)].sort();
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

  const routeByNode = new Map(routes.map((route) => [route.nodeId, route]));
  for (const edge of graph.edges) {
    const parent = routeByNode.get(edge.from);
    const child = routeByNode.get(edge.to);
    if (edge.kind !== 'loads' || !parent || !child) continue;
    child.parentNodeId = parent.nodeId;
  }
  for (const route of routes) route.parentNodeId ??= null;

  const routeScores = new Map<string, ScopeScore>();
  const seed = (fileId: string, anchor: string, score: number) => {
    const scores = routeScores.get(fileId) ?? new Map<string, number>();
    scores.set(anchor, Math.max(scores.get(anchor) ?? 0, score));
    routeScores.set(fileId, scores);
  };
  for (const route of routes) {
    const routeNode = byNode.get(route.nodeId);
    if (!routeNode?.filePath) continue;
    const routeFile = byPath.get(resolve(routeNode.filePath));
    if (!routeFile) continue;
    seed(routeFile.id, route.anchor, 1);
    for (const edge of graph.edges.filter(
      (candidate) =>
        candidate.from === route.nodeId && candidate.kind !== 'contains',
    )) {
      const target = byNode.get(edge.to);
      if (!target?.filePath) continue;
      const targetFile = byPath.get(resolve(target.filePath));
      if (targetFile) seed(targetFile.id, route.anchor, 0.92);
    }
  }

  // An import is deliberately weak evidence, but it is still useful for a
  // file the CraftTS collectors do not know. Give one direct import hop a
  // small route signal without allowing it to compete with graph relations.
  for (const edge of edgeMap.values()) {
    if (!edge.relationKinds.includes('imports')) continue;
    const sourceScores = routeScores.get(edge.from);
    if (!sourceScores) continue;
    const targetScores = routeScores.get(edge.to) ?? new Map<string, number>();
    for (const [anchor] of sourceScores)
      targetScores.set(anchor, Math.max(targetScores.get(anchor) ?? 0, 0.09));
    routeScores.set(edge.to, targetScores);
  }

  const adjacency = new Map<string, FileEdge[]>();
  for (const edge of fileEdges) {
    if (edge.relationKinds.includes('contains') || edge.weight <= 0) continue;
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge]);
    adjacency.set(edge.to, [
      ...(adjacency.get(edge.to) ?? []),
      { ...edge, from: edge.to, to: edge.from },
    ]);
  }
  const routeIterations = Math.min(8, Math.max(2, files.length));
  for (let iteration = 0; iteration < routeIterations; iteration += 1) {
    const next = new Map<string, ScopeScore>(
      [...routeScores.entries()].map(([id, scores]) => [id, new Map(scores)]),
    );
    for (const file of files) {
      const candidates = next.get(file.id) ?? new Map<string, number>();
      for (const edge of adjacency.get(file.id) ?? []) {
        const neighborScores = routeScores.get(edge.to);
        if (!neighborScores) continue;
        const neighbor = files.find((candidate) => candidate.id === edge.to);
        const hubPenalty = neighbor
          ? 1 / Math.sqrt(1 + neighbor.metrics.fanIn + neighbor.metrics.fanOut)
          : 1;
        const attenuation = Math.min(0.82, edge.weight / 8) * 0.72 * hubPenalty;
        for (const [anchor, score] of neighborScores) {
          const candidate = score * attenuation;
          if (candidate > (candidates.get(anchor) ?? 0))
            candidates.set(anchor, candidate);
        }
      }
      next.set(file.id, candidates);
    }
    routeScores.clear();
    for (const [id, scores] of next) routeScores.set(id, scores);
  }
  for (const file of files) {
    const anchors = [...(routeScores.get(file.id) ?? new Map())]
      .filter(([, score]) => score >= 0.08)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([anchor]) => anchor);
    file.routeAnchors = [...new Set([...file.routeAnchors, ...anchors])].sort();
    file.metrics.routeSpan = file.routeAnchors.length;
  }
  return { files, edges: fileEdges, routes, routeScores, diagnostics };
}

function labelPropagation(
  files: readonly InternalFile[],
  edges: readonly FileEdge[],
  thresholds: OrganizerThresholds,
): Map<string, string> {
  // Initial labels are structural signatures, never source paths. File paths
  // identify outputs, but must not decide which community wins a tie.
  const labels = new Map(
    files.map((file) => [
      file.id,
      `seed:${shortHash({
        routeAnchors: file.routeAnchors,
        craftKinds: file.craftKinds,
        fanIn: file.metrics.fanIn,
        fanOut: file.metrics.fanOut,
      })}`,
    ]),
  );
  const structuralOrder = (file: InternalFile): string =>
    stableStringify({
      routeAnchors: file.routeAnchors,
      craftKinds: file.craftKinds,
      fanIn: file.metrics.fanIn,
      fanOut: file.metrics.fanOut,
    });
  const degree = new Map<string, number>();
  for (const edge of edges) {
    if (edge.weight <= 0 || edge.relationKinds.includes('contains')) continue;
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const adjacency = new Map<string, FileEdge[]>();
  for (const edge of edges) {
    if (edge.weight <= 0 || edge.relationKinds.includes('contains')) continue;
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge]);
    adjacency.set(edge.to, [
      ...(adjacency.get(edge.to) ?? []),
      { ...edge, from: edge.to, to: edge.from },
    ]);
  }
  for (
    let iteration = 0;
    iteration < thresholds.maxIterations;
    iteration += 1
  ) {
    let changed = false;
    for (const file of [...files].sort((a, b) =>
      structuralOrder(a).localeCompare(structuralOrder(b)),
    )) {
      const scores = new Map<string, number>();
      for (const edge of adjacency.get(file.id) ?? []) {
        const label = labels.get(edge.to);
        if (!label) continue;
        const hubPenalty = 1 / Math.sqrt(1 + (degree.get(edge.to) ?? 0));
        scores.set(label, (scores.get(label) ?? 0) + edge.weight * hubPenalty);
      }
      if (scores.size === 0) continue;
      const next = [...scores.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0];
      if (next && next[0] !== labels.get(file.id)) {
        labels.set(file.id, next[0]);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return labels;
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

type CommunityPartition = {
  fileIds: string[];
  depth: number;
  cohesion: number;
};

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

/** Split only weak, sufficiently large communities, with a fixed depth cap. */
function recursivelyPartition(
  fileIds: readonly string[],
  labels: ReadonlyMap<string, string>,
  edges: readonly FileEdge[],
  thresholds: OrganizerThresholds,
  depth = 0,
): CommunityPartition[] {
  const cohesion = partitionCohesion(fileIds, edges);
  if (
    depth >= thresholds.maxDepth ||
    fileIds.length < thresholds.minCommunitySize ||
    cohesion >= thresholds.minCohesion
  ) {
    return [{ fileIds: [...fileIds].sort(), depth, cohesion }];
  }
  const subgroups = new Map<string, string[]>();
  for (const fileId of fileIds) {
    const label = labels.get(fileId) ?? fileId;
    subgroups.set(label, [...(subgroups.get(label) ?? []), fileId]);
  }
  if (subgroups.size < 2)
    return [{ fileIds: [...fileIds].sort(), depth, cohesion }];
  return [...subgroups.values()]
    .sort((a, b) =>
      a.slice().sort().join('|').localeCompare(b.slice().sort().join('|')),
    )
    .flatMap((group) =>
      recursivelyPartition(group, labels, edges, thresholds, depth + 1),
    );
}

function communityName(
  fileIds: readonly string[],
  filesById: Map<string, InternalFile>,
): string {
  const tokens = new Map<string, number>();
  for (const fileId of fileIds) {
    const file = filesById.get(fileId);
    if (!file) continue;
    for (const token of file.routeAnchors
      .flatMap((anchor) => anchor.split('/'))
      .concat(file.craftKinds, [basename(file.sourcePath)])) {
      const value = slug(token);
      if (
        value.length < 3 ||
        ['src', 'app', 'index', 'component', 'service', 'routes'].includes(
          value,
        )
      )
        continue;
      tokens.set(value, (tokens.get(value) ?? 0) + 1);
    }
  }
  return (
    [...tokens.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0] ?? 'shared'
  );
}

function classifyScope(
  file: InternalFile,
  graph: DependencyGraph,
  byNode: Map<string, DependencyGraphNode>,
): OrganizerScope {
  const routeSpan = file.routeAnchors.length;
  if (file.nodeKinds.has('app-config')) return 'core';
  const hasBoundary = file.craftNodeIds.some((id) => {
    const node = byNode.get(id);
    return (
      node?.details?.['browserBoundary'] === true ||
      node?.details?.['global'] === true
    );
  });
  if (hasBoundary) return 'core';
  const topScopes = new Set(
    file.routeAnchors.map((anchor) => anchor.split('/')[0] ?? anchor),
  );
  if (
    (file.nodeKinds.has('route-hook') || file.nodeKinds.has('route-check')) &&
    routeSpan > 1
  )
    return 'core';
  if (topScopes.size > 1) return 'global-shared';
  if (routeSpan > 1) return 'parent-shared';
  if (routeSpan === 1) return 'feature-local';
  if (file.nodeKinds.has('service') || file.nodeKinds.has('provider'))
    return 'unresolved';
  void graph;
  return 'unresolved';
}

function confidenceFor(scope: OrganizerScope, file: InternalFile): number {
  if (file.craftNodeIds.length === 0) return 0.25;
  if (scope === 'unresolved') return 0.2;
  if (scope === 'feature-local') return 0.92;
  if (scope === 'core') return 0.86;
  if (scope === 'parent-shared') return 0.78;
  return 0.74;
}

function destinationFor(
  file: InternalFile,
  scope: OrganizerScope,
  community: OrganizerCommunity | undefined,
  targetRoot: string,
): string | null {
  if (scope === 'unresolved' || !community) return null;
  const base = basename(file.sourcePath);
  const top = slug(file.routeAnchors[0]?.split('/')[0] ?? community.name);
  if (scope === 'core') return posix(join(targetRoot, 'core', base));
  if (scope === 'global-shared') return posix(join(targetRoot, 'shared', base));
  if (scope === 'parent-shared')
    return posix(join(targetRoot, 'features', top, 'shared', base));
  return posix(join(targetRoot, 'features', top, slug(community.name), base));
}

function renderReport(
  analysis: ArchitectureAnalysis,
  proposal: ArchitectureProposal,
): string {
  const lines: string[] = [
    '# Architecture proposal',
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
  const byNode = new Map(loaded.graph.nodes.map((node) => [node.id, node]));
  const labels = labelPropagation(
    projection.files,
    projection.edges,
    thresholds,
  );
  const filesById = new Map(projection.files.map((file) => [file.id, file]));
  const groups = new Map<OrganizerScope, string[]>();
  for (const file of projection.files) {
    const scope = classifyScope(file, loaded.graph, byNode);
    groups.set(scope, [...(groups.get(scope) ?? []), file.id]);
  }
  const communities: OrganizerCommunity[] = [...groups.entries()]
    .flatMap(([scope, fileIds]) =>
      recursivelyPartition(fileIds, labels, projection.edges, thresholds).map(
        (partition) => {
          const first = filesById.get(partition.fileIds[0] ?? '');
          // Community identity is architectural, not a hash of absolute source
          // paths. This keeps the same proposal stable when a legacy folder is
          // renamed before analysis.
          const partitionKey = `${scope}:${partition.fileIds
            .map((fileId) => filesById.get(fileId))
            .filter((file): file is InternalFile => file !== undefined)
            .map(
              (file) =>
                `${file.routeAnchors.join(',')}:${file.craftKinds.join(',')}:${basename(file.sourcePath)}`,
            )
            .sort()
            .join('|')}`;
          return {
            id: `community:${shortHash(partitionKey)}`,
            name: communityName(partition.fileIds, filesById),
            scope: first ? classifyScope(first, loaded.graph, byNode) : scope,
            fileIds: partition.fileIds,
            depth: partition.depth,
            cohesion: partition.cohesion,
          };
        },
      ),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const communityForFile = new Map(
    communities.flatMap((community) =>
      community.fileIds.map((fileId) => [fileId, community] as const),
    ),
  );
  const occupied = new Map<string, string>();
  const placements: FilePlacement[] = projection.files
    .map((file) => {
      const scope = classifyScope(file, loaded.graph, byNode);
      const community = communityForFile.get(file.id);
      const proposedPath = destinationFor(file, scope, community, targetRoot);
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
      const reasons: string[] = [];
      if (routeAnchors.length > 0)
        reasons.push(`route evidence: ${routeAnchors.join(', ')}`);
      if (file.nodeKinds.size > 0)
        reasons.push(`CraftTS kinds: ${[...file.nodeKinds].sort().join(', ')}`);
      if (file.craftNodeIds.length === 0)
        reasons.push('no CraftTS node; import evidence only');
      if (
        file.metrics.fanIn >= thresholds.hubFanIn ||
        file.metrics.fanOut >= thresholds.hubFanOut
      )
        reasons.push('hub influence reduced');
      let action: FilePlacement['action'] = proposedPath
        ? 'move'
        : 'keep-at-root';
      let finalPath = proposedPath;
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
          scope === 'unresolved'
            ? []
            : [posix(join(targetRoot, 'shared', basename(file.sourcePath)))],
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
  const analysis: ArchitectureAnalysis = {
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
  const proposal: ArchitectureProposal = {
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
    join(outputDir, 'architecture-analysis.json'),
    `${JSON.stringify(analysis, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    join(outputDir, 'architecture-proposal.json'),
    `${JSON.stringify(proposal, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(join(outputDir, 'ARCHITECTURE_REPORT.md'), report, 'utf8');
  return { analysis, proposal, report, outputDir };
}
