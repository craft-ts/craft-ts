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
  DependencyGraphNodeKind,
  DependencyGraphNodeRegistry,
  DependencyGraphProof,
} from './dependency-graph.js';
import {
  computeFolderLayout,
  DEFAULT_LAYOUT_GROUP_MIN_FILES,
  type FolderLayout,
  type LayoutLayer,
  type LayoutLayerViolation,
  type LayoutPlacement,
  type LayoutScope,
  type LayoutZone,
} from './folder-layout-rule.js';

export type OrganizerScope = LayoutScope;

export type OrganizerEvidence = 'ast' | 'type' | 'import';

export type GraphProof = DependencyGraphProof;

export type FileNode = {
  id: string;
  sourcePath: string;
  craftNodeIds: string[];
  craftKinds: string[];
  /** Paths of the feature zones that reach the file. */
  routeAnchors: string[];
  layer: LayoutLayer;
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
  /**
   * Files (the head included) a file must alone lead to, one level below a
   * zone's pages, to get a sub-folder of its own.
   */
  groupMinFiles: number;
  hubFanIn: number;
  hubFanOut: number;
};

/** Details emitted by the built-in Craft service collector. */
export type OrganizerServiceNodeDetails = {
  scope?: string;
  appStart?: boolean;
  browserBoundary?: boolean;
  outputProperties?: readonly string[];
  helpers?: readonly string[];
};

type OrganizerNodeDetails<K extends DependencyGraphNodeKind> =
  K extends 'service'
    ? OrganizerServiceNodeDetails
    : DependencyGraphNodeRegistry[K];

export type OrganizerPlacementWhen<K extends DependencyGraphNodeKind> = {
  nodeKind: K;
  nodeDetails?: Readonly<Partial<OrganizerNodeDetails<K>>>;
};

/**
 * A serializable, first-match placement rule. The node kind determines the
 * accepted detail keys and values. A match overrides the file's normal scope
 * and destination folder.
 */
export type OrganizerPlacementRuleFor<K extends DependencyGraphNodeKind> = {
  id: string;
  when: OrganizerPlacementWhen<K>;
  scope: OrganizerScope;
  folder: string;
  reason: string;
};

export type OrganizerPlacementRule = {
  [K in DependencyGraphNodeKind]: OrganizerPlacementRuleFor<K>;
}[DependencyGraphNodeKind];

export type OrganizerConfig = {
  weights?: Partial<OrganizerWeights>;
  thresholds?: Partial<OrganizerThresholds>;
  /** Evaluated in order before the built-in ownership classification. */
  placementRules?: readonly OrganizerPlacementRule[];
};

export const DEFAULT_ORGANIZER_THRESHOLDS: OrganizerThresholds = {
  groupMinFiles: DEFAULT_LAYOUT_GROUP_MIN_FILES,
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
  layer: LayoutLayer;
  communityId: string | null;
  routeAnchors: string[];
  confidence: number;
  reasons: string[];
  relatedFiles: string[];
  alternatives: string[];
  action: 'move' | 'review' | 'keep-at-root' | 'delete';
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
    placementRules: readonly OrganizerPlacementRule[];
    hash: string;
  };
  inventory: string[];
  routes: readonly OrganizerRoute[];
  /** The app shell and every module a `loadChildren` loads. */
  zones: LayoutZone[];
  /** Imports that point up the layers (ui → state → data-access → util). */
  layerViolations: LayoutLayerViolation[];
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
  placementRules?: readonly OrganizerPlacementRule[];
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
};

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
  layout: FolderLayout,
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
        layer: 'util',
        metrics: { fanIn: 0, fanOut: 0, routeSpan: 0 },
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
  }

  for (const file of files) {
    file.craftNodeIds = [...new Set(file.craftNodeIds)].sort();
    file.craftKinds = [...new Set(file.craftKinds)].sort();
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

  const placements = new Map(
    layout.placements.map((placement) => [
      resolve(layout.sourceRoot, placement.file),
      placement,
    ]),
  );
  for (const file of files) {
    const placement = placements.get(file.absolutePath);
    file.routeAnchors = (placement?.zones ?? []).filter(
      (zone) => zone !== 'app',
    );
    file.layer = placement?.layer ?? 'util';
    file.metrics.routeSpan = file.routeAnchors.length;
  }
  return { files, edges: fileEdges, routes, diagnostics };
}

type ScopeDecision = {
  scope: OrganizerScope;
  /** Target-root-relative folder; `null` when no entry reaches the file. */
  folder: string | null;
  reasons: string[];
  /** User-authored placement policies are decisive rather than inferred. */
  confidence?: number;
};

/** The computed layout's decision, before any project placement rule. */
function layoutDecision(placement: LayoutPlacement | undefined): ScopeDecision {
  if (!placement)
    return {
      scope: 'unresolved',
      folder: null,
      reasons: ['outside the layout target root'],
    };
  return {
    scope: placement.scope,
    folder: placement.folder,
    reasons: [...placement.reasons],
  };
}

/**
 * Placements follow imports, which the TypeScript program proves; only an
 * unreached file is a guess.
 */
function confidenceFor(scope: OrganizerScope): number {
  if (scope === 'unresolved') return 0.2;
  if (scope === 'core' || scope === 'feature-local') return 0.95;
  return 0.9;
}

const ORGANIZER_SCOPES = new Set<OrganizerScope>([
  'feature-local',
  'parent-shared',
  'global-shared',
  'core',
  'unresolved',
]);

function validatePlacementRules(
  rules: readonly OrganizerPlacementRule[],
): void {
  const ids = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    if (!rule || typeof rule !== 'object')
      throw new Error(`craft organize: placement rule ${index + 1} is invalid.`);
    if (typeof rule.id !== 'string' || !rule.id.trim() || ids.has(rule.id))
      throw new Error(
        `craft organize: placement rule ${index + 1} needs a unique, non-empty id.`,
      );
    ids.add(rule.id);
    if (!rule.when || typeof rule.when !== 'object')
      throw new Error(
        `craft organize: placement rule "${rule.id}" needs a when matcher.`,
      );
    if (typeof rule.when.nodeKind !== 'string' || !rule.when.nodeKind.trim())
      throw new Error(
        `craft organize: placement rule "${rule.id}" nodeKind must be a non-empty string.`,
      );
    if (
      rule.when.nodeDetails !== undefined &&
      (!rule.when.nodeDetails ||
        typeof rule.when.nodeDetails !== 'object' ||
        Array.isArray(rule.when.nodeDetails))
    )
      throw new Error(
        `craft organize: placement rule "${rule.id}" nodeDetails must be an object.`,
      );
    if (rule.when.nodeKind === 'service')
      validateServiceNodeDetails(rule.id, rule.when.nodeDetails);
    if (!ORGANIZER_SCOPES.has(rule.scope))
      throw new Error(
        `craft organize: placement rule "${rule.id}" has an unknown scope "${String(rule.scope)}".`,
      );
    if (typeof rule.reason !== 'string' || !rule.reason.trim())
      throw new Error(
        `craft organize: placement rule "${rule.id}" needs a non-empty reason.`,
      );
    const folder =
      typeof rule.folder === 'string'
        ? posix(rule.folder).replace(/\/+$/, '')
        : '';
    if (
      !folder ||
      folder.startsWith('/') ||
      /^[A-Za-z]:/.test(folder) ||
      folder
        .split('/')
        .some(
          (segment) => !segment || segment === '.' || segment === '..',
        )
    )
      throw new Error(
        `craft organize: placement rule "${rule.id}" folder must be a safe relative folder.`,
      );
  }
}

function validateServiceNodeDetails(
  ruleId: string,
  details: object | undefined,
): void {
  const validators: Readonly<Record<string, (value: unknown) => boolean>> = {
    scope: (value) => typeof value === 'string',
    appStart: (value) => typeof value === 'boolean',
    browserBoundary: (value) => typeof value === 'boolean',
    outputProperties: isStringArray,
    helpers: isStringArray,
  };
  for (const [key, value] of Object.entries(details ?? {})) {
    const validate = validators[key];
    if (!validate)
      throw new Error(
        `craft organize: placement rule "${ruleId}" has unknown service detail "${key}".`,
      );
    if (!validate(value))
      throw new Error(
        `craft organize: placement rule "${ruleId}" has an invalid value for service detail "${key}".`,
      );
  }
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function placementRuleForFile(
  file: InternalFile,
  nodesById: ReadonlyMap<string, DependencyGraphNode>,
  rules: readonly OrganizerPlacementRule[],
): OrganizerPlacementRule | undefined {
  for (const rule of rules) {
    const matches = file.craftNodeIds.some((id) => {
      const node = nodesById.get(id);
      if (!node) return false;
      if (node.kind !== rule.when.nodeKind)
        return false;
      return Object.entries(rule.when.nodeDetails ?? {}).every(
        ([key, expected]) =>
          node.details !== undefined &&
          Object.hasOwn(node.details, key) &&
          stableStringify(node.details[key]) === stableStringify(expected),
      );
    });
    if (matches) return rule;
  }
  return undefined;
}

function classifyWithPlacementRules(
  file: InternalFile,
  placement: LayoutPlacement | undefined,
  nodesById: ReadonlyMap<string, DependencyGraphNode>,
  rules: readonly OrganizerPlacementRule[],
): ScopeDecision {
  const rule = placementRuleForFile(file, nodesById, rules);
  if (!rule) return layoutDecision(placement);
  return {
    scope: rule.scope,
    folder: posix(rule.folder).replace(/\/+$/, ''),
    confidence: 1,
    reasons: [`placement rule "${rule.id}": ${rule.reason}`],
  };
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
        `- \`${placement.proposedPath}\` — ${placement.scope} · ${placement.layer} (${placement.confidence.toFixed(2)})`,
      );
    lines.push('');
  }
  lines.push('## Zones', '');
  for (const zone of analysis.zones)
    lines.push(
      `- \`${zone.path}\` ← \`${zone.entry}\`: own files in \`${zone.folder}/\`, shared in \`${zone.sharedFolder}/\``,
    );
  lines.push('', '## Layer violations', '');
  if (analysis.layerViolations.length === 0)
    lines.push('Every import points down the layers.', '');
  else {
    for (const violation of analysis.layerViolations)
      lines.push(
        `- \`${violation.file}\` (${violation.layer}) imports \`${violation.imported}\` (${violation.importedLayer})`,
      );
    lines.push('');
  }
  const deletions = proposal.placements.filter(
    (placement) => placement.action === 'delete',
  );
  lines.push('## Orphaned files proposed for deletion', '');
  if (deletions.length === 0) lines.push('No orphaned files.', '');
  else {
    for (const placement of deletions)
      lines.push(
        `- \`${placement.sourcePath}\` — ${placement.reasons.join('; ')}`,
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
      `- Layer: **${placement.layer}**`,
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
    `- Deletions: ${deletions.length}`,
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
  const placementRules = [...(options.placementRules ?? [])];
  validatePlacementRules(placementRules);
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
  const layout = computeFolderLayout({
    rootDir,
    tsConfigFilePath: project,
    graph: loaded.graph,
    groupMinFiles: thresholds.groupMinFiles,
  });
  const layoutByPath = new Map(
    layout.placements.map((placement) => [
      resolve(layout.sourceRoot, placement.file),
      placement,
    ]),
  );
  const projection = makeProjection(
    loaded.graph,
    rootDir,
    parsed,
    weights,
    layout,
  );
  const filesById = new Map(projection.files.map((file) => [file.id, file]));
  const nodesById = new Map(loaded.graph.nodes.map((node) => [node.id, node]));
  const decisions = new Map(
    projection.files.map(
      (file) =>
        [
          file.id,
          classifyWithPlacementRules(
            file,
            layoutByPath.get(file.absolutePath),
            nodesById,
            placementRules,
          ),
        ] as const,
    ),
  );
  const folders = new Map<
    string,
    { scope: OrganizerScope; fileIds: string[] }
  >();
  for (const file of projection.files) {
    const decision = decisions.get(file.id) as ScopeDecision;
    const { folder } = decision;
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
      const proposedPath = community
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
        : scope === 'unresolved'
          ? 'delete'
          : 'keep-at-root';
      if (action === 'delete')
        reasons.push('orphaned file proposed for deletion');
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
      const confidence = decision.confidence ?? confidenceFor(scope);
      if (confidence < 0.5 && action === 'move') action = 'review';
      return {
        sourcePath: file.sourcePath,
        proposedPath: finalPath,
        scope,
        layer: file.layer,
        communityId: community?.id ?? null,
        routeAnchors,
        confidence,
        reasons,
        relatedFiles,
        alternatives: [],
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
    placementRules,
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
    zones: layout.zones,
    layerViolations: layout.layerViolations,
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
      ...layout.diagnostics,
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
