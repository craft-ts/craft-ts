import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { DependencyGraph, DependencyGraphNode } from '@craft-ts/dev-tools/dependency-graph';
import { DEPENDENCY_FORWARD } from '@craft-ts/dev-tools/graph-metrics';
import { createSliceIndex, impactOf, PRODUCES_BACKWARD } from '@craft-ts/dev-tools/scripts/code-slice.js';

/**
 * The recorded sessions a change touches: the ones to replay after an edit,
 * before handing back.
 *
 * The changed lines name the graph's nodes that cover them; their impact
 * (every node whose output may change with them) widens the set. Each node
 * names the coverage units a session shows when it runs that node —
 * `invocation:cart.add`, `interaction:CheckoutPage:button:confirm-order:click`,
 * `route-activation:ecommerce:panier`, `server-fn:ecommerce.checkout:ok` — and
 * a session of the golden set is kept when one of its units is named.
 *
 * Cautious on purpose: a session replayed for nothing costs a replay, one left
 * out hides a regression. A changed code file the graph does not know makes
 * every session relevant.
 */
export type GoldenSetForImpact = Readonly<{
  sessions: readonly Readonly<{ sessionId: string; recordedAt: string; units: readonly string[] }>[];
}>;

/** A changed file, relative to the graph's root or absolute; `lines` absent means the whole file. */
export type FileChange = Readonly<{ file: string; lines?: readonly (readonly [number, number])[] }>;

export type RelevantSession = Readonly<{
  sessionId: string;
  recordedAt: string;
  /** `direct`: a changed node; `impact`: a node it feeds; `unmapped`: a changed file the graph does not know. */
  hit: 'direct' | 'impact' | 'unmapped';
  /** The session's units the change names (at most `maxUnits`). */
  units: readonly string[];
  /** The nodes that named them. */
  because: readonly string[];
}>;

export type RelevantSessionsResult = Readonly<{
  sessions: readonly RelevantSession[];
  /** Nodes covering the changed lines. */
  changed: readonly Readonly<{ kind: string; label: string; file?: string }>[];
  /** Nodes reached by impact only. */
  impacted: number;
  /** Changed code files without a node, and stylesheets: every session is replayed for them. */
  unmappedFiles: readonly string[];
  /** Files a replay cannot show (tests, docs). */
  ignoredFiles: readonly string[];
  /** Sessions of the set the change does not touch. */
  untouched: number;
}>;

export type RelevantSessionsOptions = Readonly<{
  rootDir: string;
  maxUnits?: number;
}>;

/**
 * What a change reaches, in reverse of what produces a node, without one
 * relation: a component `provides` a scoped service, and the service's slice
 * takes the component in, render tree and all. Followed backward from a
 * change, it made every page that uses its own instance of the service
 * (`storefrontView` on the home page) look touched by a change to another
 * page's child (the formula composer): every session was replayed. A change
 * to the provider itself is a change to the providing component, a direct hit.
 */
const IMPACT_BACKWARD = PRODUCES_BACKWARD.filter((kind) => kind !== 'provides');

const CODE_FILE = /\.(c|m)?[jt]sx?$/;
/** A stylesheet changes what every page shows, and the graph has no node for it. */
const STYLE_FILE = /\.(css|scss|sass|less)$/;
const NOT_RUN = /(\.spec|\.test|\.e2e)\.[cm]?[jt]sx?$|\.d\.ts$|(^|\/)(e2e|architecture|test|tests)\//;

export function relevantGoldenSessions(
  graph: DependencyGraph,
  goldenSet: GoldenSetForImpact,
  changes: readonly FileChange[],
  options: RelevantSessionsOptions,
): RelevantSessionsResult {
  const maxUnits = options.maxUnits ?? 10;
  const rootDir = canonical(options.rootDir);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  // Paths compared as the filesystem resolves them: git answers `/private/var`
  // where the graph was built from `/var`, through a symlink.
  const nodesByFile = new Map<string, DependencyGraphNode[]>();
  for (const node of graph.nodes) {
    if (!node.filePath) continue;
    const file = canonical(node.filePath);
    nodesByFile.set(file, [...(nodesByFile.get(file) ?? []), node]);
  }

  const changed = new Map<string, DependencyGraphNode>();
  const unmappedFiles: string[] = [];
  const ignoredFiles: string[] = [];
  for (const change of changes) {
    const file = canonical(isAbsolute(change.file) ? change.file : resolve(rootDir, change.file));
    const relative = file.startsWith(`${rootDir}/`) ? file.slice(rootDir.length + 1) : file;
    if (STYLE_FILE.test(file) && !NOT_RUN.test(relative)) {
      unmappedFiles.push(relative);
      continue;
    }
    if (!CODE_FILE.test(file) || NOT_RUN.test(relative)) {
      ignoredFiles.push(relative);
      continue;
    }
    const inFile = nodesByFile.get(file) ?? [];
    if (inFile.length === 0) {
      unmappedFiles.push(relative);
      continue;
    }
    const covering = change.lines
      ? inFile.filter((node) => change.lines!.some(([from, to]) => overlaps(node, from, to)))
      : inFile;
    // Lines outside any node (an import, a module helper): the whole file.
    for (const node of covering.length > 0 ? covering : inFile) changed.set(node.id, node);
  }

  const index = createSliceIndex(graph, { readFile: () => undefined, forward: DEPENDENCY_FORWARD, backward: IMPACT_BACKWARD });
  const impacted = new Map<string, DependencyGraphNode>();
  for (const id of changed.keys())
    for (const reached of impactOf(index, id)) {
      const node = nodesById.get(reached);
      if (node && !changed.has(reached)) impacted.set(reached, node);
    }

  const direct = [...changed.values()].flatMap((node) => needlesOf(node, nodesById));
  const wide = [...impacted.values()].flatMap((node) => needlesOf(node, nodesById));
  const sessions: RelevantSession[] = [];
  for (const session of goldenSet.sessions) {
    const match = (needles: readonly Needle[]) => {
      const units = session.units.filter((unit) => needles.some((needle) => needle.test.test(unit)));
      const because = [...new Set(needles.filter((needle) => units.some((unit) => needle.test.test(unit))).map((needle) => needle.node))];
      return { units, because };
    };
    const directHits = match(direct);
    const impactHits = directHits.units.length > 0 ? directHits : match(wide);
    const hit = directHits.units.length > 0 ? 'direct' : impactHits.units.length > 0 ? 'impact' : unmappedFiles.length > 0 ? 'unmapped' : undefined;
    if (!hit) continue;
    sessions.push({
      sessionId: session.sessionId,
      recordedAt: session.recordedAt,
      hit,
      units: impactHits.units.slice(0, maxUnits),
      because: hit === 'unmapped' ? unmappedFiles : impactHits.because,
    });
  }
  const rank = { direct: 0, impact: 1, unmapped: 2 } as const;
  sessions.sort((a, b) => rank[a.hit] - rank[b.hit] || (a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : 0));
  return {
    sessions,
    changed: [...changed.values()].map((node) => ({ kind: node.kind, label: node.label, ...(node.filePath ? { file: node.filePath } : {}) })),
    impacted: impacted.size,
    unmappedFiles,
    ignoredFiles,
    untouched: goldenSet.sessions.length - sessions.length,
  };
}

type Needle = Readonly<{ node: string; test: RegExp }>;

/** The units a session shows when it runs this node. */
export function needlesOf(node: DependencyGraphNode, nodesById: ReadonlyMap<string, DependencyGraphNode>): Needle[] {
  const details = node.details ?? {};
  const text = (key: string) => (typeof details[key] === 'string' ? (details[key] as string) : undefined);
  const name = `${node.kind}:${node.label}`;
  const needle = (pattern: string): Needle => ({ node: name, test: new RegExp(pattern) });
  const owner = (id: string | undefined) => (id ? nodesById.get(id) : undefined);
  switch (node.kind) {
    case 'service':
      return [needle(`^invocation:${escape(node.label)}\\.`), needle(`service:${escape(node.label)} /`)];
    case 'component':
      return [needle(`^interaction:${escape(node.label)}:`), needle(`component:${escape(node.label)}( |$)`)];
    case 'template-element': {
      const component = text('component');
      const tag = text('tag');
      const local = text('localName');
      return component && tag && local ? [needle(`^interaction:${escape(component)}:${escape(tag)}:${escape(local)}:`)] : [];
    }
    case 'primitive': {
      const host = owner(text('ownerId'));
      const primitive = text('name');
      if (!host || !primitive || (host.kind !== 'service' && host.kind !== 'component')) return [];
      return [
        needle(`${host.kind}:${escape(host.label)} / ${escape(node.label)}( |$)`),
        needle(`^invocation:${escape(host.label)}\\.${escape(primitive)}(:|$)`),
      ];
    }
    case 'property': {
      const member = text('member');
      // property:<primitive id>:<member>
      const primitive = owner(node.id.slice('property:'.length, node.id.lastIndexOf(':')));
      const host = owner(primitive?.details?.['ownerId'] as string | undefined);
      return member && host ? [needle(`^invocation:${escape(host.label)}\\.${escape(member)}(:|$)`)] : [];
    }
    case 'route': {
      // `collection:path` in the label when the details do not say.
      const separator = node.label.indexOf(':');
      const path = text('path') ?? (separator >= 0 ? node.label.slice(separator + 1) : node.label);
      const collection = text('collection') ?? (separator >= 0 ? node.label.slice(0, separator) : undefined);
      return [
        needle(`^route-activation:(${collection ? `${escape(collection)}:` : ''})?${escape(path)}(:failed)?$`),
        needle(`^route:/${escape(path)}(:[a-z]+)?$`),
      ];
    }
    case 'server-function-family':
    case 'server-function-misnamed':
    case 'server-function-contract':
    case 'server-function-client':
    case 'server-function-server': {
      const id = text('serverFunctionId');
      return id ? [needle(`^server-fn:${escape(id)}:`)] : [];
    }
    default:
      return [];
  }
}

const canonicalPaths = new Map<string, string>();
/** The path with its symlinks resolved; as given when it does not exist (a deleted file). */
function canonical(path: string): string {
  let known = canonicalPaths.get(path);
  if (known === undefined) {
    try {
      known = realpathSync.native(path);
    } catch {
      const parent = path.slice(0, path.lastIndexOf('/'));
      known = parent && parent !== path ? `${canonical(parent)}${path.slice(parent.length)}` : path;
    }
    canonicalPaths.set(path, known);
  }
  return known;
}

/** Whether the node's lines meet `[from, to]`; an empty range (`from > to`) is met by the nodes around it. */
function overlaps(node: DependencyGraphNode, from: number, to: number): boolean {
  if (node.line === undefined) return false;
  const end = node.endLine ?? node.line;
  return node.line <= to && from <= end;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * The changed lines of a unified diff (`git diff -U0`), new side, by file.
 * A deleted file is reported whole under its old path.
 */
export function changesFromUnifiedDiff(diff: string): FileChange[] {
  const changes = new Map<string, { lines: [number, number][]; whole: boolean }>();
  let current: string | undefined;
  let oldPath: string | undefined;
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) oldPath = line.slice(4).replace(/^a\//, '');
    else if (line.startsWith('+++ ')) {
      const target = line.slice(4);
      if (target === '/dev/null') {
        current = undefined;
        if (oldPath && oldPath !== '/dev/null') changes.set(oldPath, { lines: [], whole: true });
      } else {
        current = target.replace(/^b\//, '');
        if (!changes.has(current)) changes.set(current, { lines: [], whole: false });
      }
    } else if (line.startsWith('@@') && current) {
      const match = /\+(\d+)(?:,(\d+))?/.exec(line);
      if (!match) continue;
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      // A pure deletion (count 0) sits between line `start` and the next: an
      // empty range, `[start + 1, start]`, that only the nodes spanning both
      // lines overlap. Counting the two lines themselves made a node that
      // merely ends above (a call on the line before) changed, and its impact
      // could reach the whole app.
      changes.get(current)!.lines.push(count === 0 ? [start + 1, start] : [start, start + count - 1]);
    }
  }
  return [...changes].map(([file, change]) => (change.whole ? { file } : { file, lines: change.lines }));
}

/** Reads an app's golden set (`.craft/golden-set.json`), checking only what the impact needs. */
export function readGoldenSetForImpact(file: string): GoldenSetForImpact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Aucun golden set lisible à ${file} (${error instanceof Error ? error.message : String(error)}) : le proposer d’abord avec sessions.goldenSet du MCP des logs.`);
  }
  const sessions = typeof parsed === 'object' && parsed !== null ? (parsed as { sessions?: unknown }).sessions : undefined;
  if (
    !Array.isArray(sessions) ||
    !sessions.every((session) =>
      typeof session === 'object' && session !== null &&
      typeof (session as Record<string, unknown>)['sessionId'] === 'string' &&
      typeof (session as Record<string, unknown>)['recordedAt'] === 'string' &&
      Array.isArray((session as Record<string, unknown>)['units']))
  )
    throw new Error(`${file} n’est pas un golden set (craft-golden-set).`);
  return { sessions: sessions as GoldenSetForImpact['sessions'] };
}

/**
 * What changed since `since` (a ref; `HEAD` by default: what is not
 * committed), new files included, as absolute paths. Within `scope` only,
 * the app's folder by default: a change elsewhere in a monorepo (another
 * app, a library being worked on) would otherwise make every session
 * relevant.
 */
export function gitChanges(scope: string, since = 'HEAD'): FileChange[] {
  const git = (args: readonly string[]) => execFileSync('git', ['-C', scope, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const top = git(['rev-parse', '--show-toplevel']).trim();
  const absolute = (file: string) => resolve(top, file);
  const changed = changesFromUnifiedDiff(git(['diff', '-U0', '--no-color', '--no-ext-diff', since, '--', '.']))
    .map((change) => ({ ...change, file: absolute(change.file) }));
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--full-name', '--', '.'])
    .split('\n')
    .filter(Boolean)
    .map((file) => ({ file: absolute(file) }));
  return [...changed, ...untracked];
}
