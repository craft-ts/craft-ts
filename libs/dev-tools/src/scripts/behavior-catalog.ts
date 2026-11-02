/**
 * The behaviours an app owes a test for, computed from its dependency graph.
 *
 * An obligation is **what a user can trigger × each typed outcome**: a routed
 * page, a guard, a craftMethod, a mutation, a query called through its
 * `method`, an async process, a state machine, a server function, each typed
 * exception of an HTTP endpoint. Computeds and
 * internal helpers are not obligations: proving them one by one is the
 * function-by-function testing this catalog exists to avoid.
 *
 * Three properties the rest of the plan depends on (`behavior-tests-plan.md`):
 *
 * - **deterministic**: the catalog is read from the graph alone and sorted, so
 *   the same sources give the same file, byte for byte;
 * - **nothing guessed**: an HTTP call whose URL the graph cannot read fails the
 *   generation until an explicit contract names it;
 * - **ids built on names**, never on a path or a line: moving code changes
 *   nothing, renaming changes the id, and that shows in the diff as a change
 *   of contract.
 *
 * The ratchet compares the catalog generated from the working tree with the
 * one committed on the base branch, obligation by obligation: a removed one is
 * always fine, a new one arrives with its proof or a reasoned waiver, and one
 * proven on the base keeps its proof. Proofs come from test traces
 * (`behavior-proofs.ts`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { relativeGraphPath } from './architecture-graph.ts';
import {
  behaviorProofIndex,
  provenBehaviors,
  type BehaviorProofIndex,
  type BehaviorTraceLike,
} from './behavior-proofs.ts';

export * from './behavior-proofs.ts';
export * from './behavior-proof-index.ts';
export * from './behavior-mutants.ts';
export * from './behavior-coverage.ts';
import type { DependencyGraph, DependencyGraphNode } from './dependency-graph.js';

export const BEHAVIOR_KINDS = [
  'route',
  'guard',
  'method',
  'mutation',
  /** A query with a `method`: it loads when called, like a mutation. */
  'command',
  'async-process',
  'state-machine',
  'server-function',
  'http-exception',
  'declared',
] as const;

export type BehaviorKind = (typeof BEHAVIOR_KINDS)[number];

export type BehaviorEntry = {
  readonly id: string;
  readonly kind: BehaviorKind;
  /** Where it is declared, for a reader; never part of the id. */
  readonly file?: string;
};

export type BehaviorCatalog = {
  readonly version: 1;
  readonly behaviors: readonly BehaviorEntry[];
};

/** What the graph cannot read about an HTTP call, keyed `file:line`. */
export type BehaviorHttpContract = {
  readonly method: string;
  readonly url: string;
  readonly exceptions: readonly string[];
};

/**
 * A behaviour no craft primitive expresses — a pricing rule in a pure
 * function, DOM driven by hand — declared so that it is owed a test too.
 */
export type DeclaredBehavior = {
  readonly id: string;
  readonly reason: string;
  readonly file?: string;
};

export type BehaviorCatalogOptions = {
  /** Directories, relative to the graph root, whose code owns obligations. */
  readonly sourceRoots: readonly string[];
  readonly httpContracts?: Readonly<Record<string, BehaviorHttpContract>>;
  readonly declared?: readonly DeclaredBehavior[];
};

export type BehaviorCatalogProblem = {
  readonly kind: 'unresolved-http' | 'duplicate-behavior' | 'invalid-declared';
  readonly message: string;
};

const GUARD_HOOKS = new Set([
  'canActivate',
  'canActivateChild',
  'canDeactivate',
  'canMatch',
]);

const PRIMITIVE_KINDS: Readonly<
  Record<string, { kind: BehaviorKind; outcome?: string }>
> = {
  craftMethod: { kind: 'method' },
  mutation: { kind: 'mutation', outcome: 'success' },
  asyncProcess: { kind: 'async-process', outcome: 'success' },
  craftStateMachine: { kind: 'state-machine' },
};

export function buildBehaviorCatalog(
  graph: DependencyGraph,
  options: BehaviorCatalogOptions,
): { catalog: BehaviorCatalog; problems: BehaviorCatalogProblem[] } {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const roots = options.sourceRoots.map((root) =>
    resolve(graph.rootDir, root),
  );
  const owned = (filePath: string | undefined): boolean =>
    filePath !== undefined &&
    roots.some(
      (root) =>
        resolve(graph.rootDir, filePath) === root ||
        resolve(graph.rootDir, filePath).startsWith(root + sep),
    );
  const file = (node: DependencyGraphNode) =>
    relativeGraphPath(graph, node.filePath);
  const ownerName = (node: DependencyGraphNode): string => {
    const ownerId = node.details?.['ownerId'];
    const owner =
      typeof ownerId === 'string' ? nodesById.get(ownerId) : undefined;
    if (owner) return owner.label;
    return (file(node) ?? node.id).replace(/^.*\//, '').replace(/\.[^.]+$/, '');
  };

  const entries: BehaviorEntry[] = [];
  const problems: BehaviorCatalogProblem[] = [];
  const add = (id: string, kind: BehaviorKind, filePath?: string) =>
    entries.push({ id, kind, ...(filePath ? { file: filePath } : {}) });

  for (const node of graph.nodes) {
    if (!owned(node.filePath)) continue;
    if (node.kind === 'route' && node.details?.['hasComponent'] === true) {
      add(`route:${node.label}`, 'route', file(node));
    }
    if (node.kind === 'route-hook') {
      const hook = node.label.slice(node.label.lastIndexOf('.') + 1);
      if (GUARD_HOOKS.has(hook)) add(`guard:${node.label}`, 'guard', file(node));
    }
    if (node.kind === 'primitive') {
      const primitive =
        PRIMITIVE_KINDS[String(node.details?.['primitive'])] ??
        (node.details?.['triggeredByMethod'] === true
          ? { kind: 'command' as const, outcome: 'success' }
          : undefined);
      if (!primitive) continue;
      const name = String(node.details?.['name'] ?? node.label);
      const outcome = primitive.outcome ? `#${primitive.outcome}` : '';
      add(
        `${primitive.kind}:${ownerName(node)}.${name}${outcome}`,
        primitive.kind,
        file(node),
      );
    }
    if (node.kind === 'server-function-family') {
      const id = node.details?.['serverFunctionId'];
      if (typeof id === 'string')
        add(`server-function:${id}`, 'server-function', file(node));
    }
  }

  for (const endpoint of graph.nodes) {
    if (endpoint.kind !== 'http-endpoint') continue;
    if (!httpEndpointIsOwned(graph, endpoint, owned)) continue;
    const at = `${file(endpoint)}:${endpoint.line}`;
    // Keyed by the primitive that makes the call, so that editing the file
    // above it does not orphan the contract; `file:line` is still read.
    const caller = callerName(endpoint, nodesById);
    const key = caller ? `${file(endpoint)}#${caller}` : at;
    const contract = endpoint.details?.['unresolved']
      ? (options.httpContracts?.[key] ?? options.httpContracts?.[at])
      : {
          method: String(endpoint.details?.['method'] ?? ''),
          url: String(endpoint.details?.['url'] ?? ''),
          exceptions: stringArray(endpoint.details?.['exceptions']),
        };
    if (!contract) {
      problems.push({
        kind: 'unresolved-http',
        message: `HTTP call at ${at} has a URL the graph cannot read; declare its contract in httpContracts['${key}'] ({ method, url, exceptions }).`,
      });
      continue;
    }
    for (const exception of contract.exceptions) {
      add(
        `http-exception:${contract.method.toUpperCase()} ${contract.url}#${exception}`,
        'http-exception',
        file(endpoint),
      );
    }
  }

  for (const declared of options.declared ?? []) {
    if (!declared.id.trim() || !declared.reason.trim()) {
      problems.push({
        kind: 'invalid-declared',
        message: `Declared behaviour '${declared.id}' needs an id and a reason.`,
      });
      continue;
    }
    add(`declared:${declared.id}`, 'declared', declared.file);
  }

  const files = new Map<string, Set<string>>();
  for (const entry of entries) {
    const set = files.get(entry.id) ?? new Set<string>();
    set.add(entry.file ?? '?');
    files.set(entry.id, set);
  }
  for (const [id, where] of files) {
    if (where.size > 1)
      problems.push({
        kind: 'duplicate-behavior',
        message: `Behaviour '${id}' is declared in ${[...where].sort().join(', ')}. Ids are built on names so that moving code keeps them: rename one of the owners.`,
      });
  }

  const unique = new Map<string, BehaviorEntry>();
  for (const entry of entries) {
    const known = unique.get(entry.id);
    if (!known || (entry.file ?? '') < (known.file ?? '')) {
      unique.set(entry.id, entry);
    }
  }
  return {
    catalog: {
      version: 1,
      behaviors: [...unique.values()].sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      ),
    },
    problems,
  };
}

function httpEndpointIsOwned(
  graph: DependencyGraph,
  endpoint: DependencyGraphNode,
  owned: (filePath: string | undefined) => boolean,
): boolean {
  const callSites = endpoint.details?.['callSites'];
  if (
    Array.isArray(callSites) &&
    callSites.some((site) => owned((site as { filePath?: string }).filePath))
  ) {
    return true;
  }
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges.some(
    (edge) =>
      edge.kind === 'calls' &&
      edge.to === endpoint.id &&
      owned(nodesById.get(edge.from)?.filePath),
  );
}

/** The name of the one primitive or service that makes this call, if one. */
function callerName(
  endpoint: DependencyGraphNode,
  nodesById: ReadonlyMap<string, DependencyGraphNode>,
): string | undefined {
  const callSites = endpoint.details?.['callSites'];
  if (!Array.isArray(callSites)) return undefined;
  const names = new Set(
    callSites.map((site) => {
      const owner = nodesById.get(String((site as { ownerId?: unknown }).ownerId));
      return owner ? String(owner.details?.['name'] ?? owner.label) : undefined;
    }),
  );
  const [name] = names;
  return names.size === 1 ? name : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

const CATALOG_PREFIX = 'export const behaviorCatalog = ';
const CATALOG_SUFFIX = ' as const;';

export function behaviorCatalogToTypeScript(catalog: BehaviorCatalog): string {
  return `// Generated. Do not edit: the architecture suite rewrites it with \`vitest -u\`.\n${CATALOG_PREFIX}${JSON.stringify(catalog, null, 2)}${CATALOG_SUFFIX}\nexport type BehaviorCatalogType = typeof behaviorCatalog;\n`;
}

/** Reads back a file written by `behaviorCatalogToTypeScript`. */
export function parseBehaviorCatalogSource(
  source: string,
): BehaviorCatalog | undefined {
  const start = source.indexOf(CATALOG_PREFIX);
  const end = source.lastIndexOf(CATALOG_SUFFIX);
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(
      source.slice(start + CATALOG_PREFIX.length, end),
    ) as BehaviorCatalog;
  } catch {
    return undefined;
  }
}

/**
 * The catalog as committed where the current branch left `baseRef`
 * (their merge base). `undefined` when there is none to compare with: no git,
 * a shallow clone without the base, or a catalog the base does not have yet.
 */
export function readBehaviorCatalogAtBase(options: {
  readonly rootDir: string;
  /** Path of the catalog file, relative to `rootDir`. */
  readonly catalogPath: string;
  /** Tried in order; the first one git knows is the base. */
  readonly baseRef?: string | readonly string[];
}): BehaviorCatalog | undefined {
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: options.rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const refs =
    typeof options.baseRef === 'string'
      ? [options.baseRef]
      : (options.baseRef ?? [
          process.env['CRAFT_BEHAVIOR_BASE'] ?? 'main',
          'origin/main',
        ]);
  for (const ref of refs) {
    try {
      const base = git('merge-base', 'HEAD', ref).trim();
      // `rev:./path` is relative to `cwd`: no need to know where the work
      // tree starts, which a symlinked checkout makes ambiguous.
      const path = options.catalogPath.split(sep).join('/');
      return parseBehaviorCatalogSource(git('show', `${base}:./${path}`));
    } catch {
      // Unknown ref, or a base without the catalog: try the next one.
    }
  }
  return undefined;
}

export type BehaviorCatalogDiff = {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly kept: readonly string[];
};

export function diffBehaviorCatalogs(
  base: BehaviorCatalog,
  next: BehaviorCatalog,
): BehaviorCatalogDiff {
  const before = new Set(base.behaviors.map((entry) => entry.id));
  const after = new Set(next.behaviors.map((entry) => entry.id));
  return {
    added: [...after].filter((id) => !before.has(id)).sort(),
    removed: [...before].filter((id) => !after.has(id)).sort(),
    kept: [...after].filter((id) => before.has(id)).sort(),
  };
}

export const BEHAVIOR_RULE_NAMES = [
  'behavior-unproven',
  'behavior-test-mocks-boundaries',
] as const;

export type BehaviorRuleName = (typeof BEHAVIOR_RULE_NAMES)[number];

/**
 * A deliberate gap, with the reason a reviewer decides on.
 *
 * - `behavior-unproven` names an obligation of the catalog that has no proof;
 * - `behavior-test-mocks-boundaries` names `<spec file>:<register key>`, a
 *   service a test mocks although it is not a boundary.
 */
export type BehaviorWaiver<C extends BehaviorCatalog = BehaviorCatalog> =
  | {
      readonly rule: 'behavior-unproven';
      readonly target: C['behaviors'][number]['id'];
      readonly reason: string;
    }
  | {
      readonly rule: 'behavior-test-mocks-boundaries';
      readonly target: `${string}:${string}`;
      readonly reason: string;
    };

/** Types an app's behaviour waivers against its catalog; returns them as is. */
export function defineBehaviorWaivers<const C extends BehaviorCatalog>(
  _catalog: C,
  waivers: readonly BehaviorWaiver<C>[],
): readonly BehaviorWaiver<C>[] {
  return waivers;
}

export type BehaviorRatchetReport = {
  /** No base catalog to compare with: the ratchet did not run. */
  readonly baseline: 'compared' | 'missing';
  readonly diff?: BehaviorCatalogDiff;
  /** New obligations with neither proof nor waiver. */
  readonly unproven: readonly string[];
  /**
   * Obligations proven on the base, still there, and proven no more: the
   * test that covered them was removed or weakened. The regression that
   * counts, and the one a coverage rate hides.
   */
  readonly lost: readonly string[];
  /** Waivers refused for themselves: empty reason, stale, unknown rule. */
  readonly waiverProblems: readonly string[];
};

/**
 * Obligation by obligation, never a rate: a rate punishes deleting a
 * well-tested feature and lets a loss hide behind a gain elsewhere.
 *
 * `proven` comes from the traces of the tests that ran (`behavior-proofs.ts`),
 * `baseProven` from the same tests at the base. A waiver names a gap on
 * purpose and goes stale once its obligation is gone or proven.
 */
export function behaviorRatchet(options: {
  readonly base: BehaviorCatalog | undefined;
  readonly next: BehaviorCatalog;
  readonly waivers?: readonly BehaviorWaiver[];
  readonly proven?: ReadonlySet<string>;
  readonly baseProven?: ReadonlySet<string>;
}): BehaviorRatchetReport {
  const ids = new Set(options.next.behaviors.map((entry) => entry.id));
  const waiverProblems: string[] = [];
  const waived = new Set<string>();
  for (const waiver of options.waivers ?? []) {
    if (waiver.rule !== 'behavior-unproven') continue;
    const label = `waiver ${waiver.rule} → ${waiver.target}`;
    if (!waiver.reason?.trim()) {
      waiverProblems.push(
        `${label}: the reason is empty. A waiver without a reason gives the reviewer nothing to decide on.`,
      );
    } else if (!ids.has(waiver.target)) {
      waiverProblems.push(
        `${label} is stale: the obligation is gone. Remove it from architecture/behavior-waivers.ts.`,
      );
    } else if (options.proven?.has(waiver.target)) {
      waiverProblems.push(
        `${label} is stale: a test proves it now. Remove it from architecture/behavior-waivers.ts.`,
      );
    } else {
      waived.add(waiver.target);
    }
  }
  if (!options.base) {
    return { baseline: 'missing', unproven: [], lost: [], waiverProblems };
  }
  const diff = diffBehaviorCatalogs(options.base, options.next);
  return {
    baseline: 'compared',
    diff,
    unproven: diff.added.filter(
      (id) => !waived.has(id) && !options.proven?.has(id),
    ),
    lost: diff.kept.filter(
      (id) =>
        options.baseProven?.has(id) === true &&
        !options.proven?.has(id) &&
        !waived.has(id),
    ),
    waiverProblems,
  };
}

/**
 * Test helpers whose register map installs a service's dependencies.
 *
 * The template helpers (`setupCraftComponentTemplateTest`,
 * `setupCraftDirectiveTemplateTest`) are left out on purpose: they render a
 * template from the view they are given, so a hand-made view is what they are
 * for, not a shortcut around the boundaries.
 */
const REGISTER_AS_SECOND_ARGUMENT = new Set([
  'setupCraftServiceTest',
  'setupCraftServiceTestingByRegister',
  'setupTestingService',
]);

export type BehaviorTestMock = {
  readonly file: string;
  readonly line: number;
  readonly key: string;
};

export type BehaviorTestMockViolation = BehaviorTestMock & {
  readonly target: `${string}:${string}`;
  readonly message: string;
};

/**
 * The services each spec file replaces with a hand-made value.
 *
 * In a register map, a string (`'notReached'`) and a `provideX()` call keep
 * the real thing; anything else is a mock.
 */
export function behaviorTestMocks(
  rootDir: string,
  testFiles: readonly string[],
): BehaviorTestMock[] {
  const mocks: BehaviorTestMock[] = [];
  for (const testFile of testFiles) {
    const filePath = resolve(rootDir, testFile);
    const source = ts.createSourceFile(
      filePath,
      readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const file = relative(rootDir, filePath).split(sep).join('/');
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const register = registerMapOf(node);
        if (register) {
          for (const property of register.properties) {
            const key = propertyKey(property);
            if (key === undefined || keepsTheRealService(property)) continue;
            mocks.push({
              file,
              line:
                source.getLineAndCharacterOfPosition(property.getStart(source))
                  .line + 1,
              key,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return mocks;
}

function registerMapOf(
  call: ts.CallExpression,
): ts.ObjectLiteralExpression | undefined {
  const callee = call.expression;
  if (
    ts.isIdentifier(callee) &&
    REGISTER_AS_SECOND_ARGUMENT.has(callee.text)
  ) {
    const register = call.arguments[1];
    return register && ts.isObjectLiteralExpression(register)
      ? register
      : undefined;
  }
  return undefined;
}

function propertyKey(property: ts.ObjectLiteralElementLike): string | undefined {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  if (!ts.isPropertyAssignment(property)) return undefined;
  const name = property.name;
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name)
    ? name.text
    : undefined;
}

function keepsTheRealService(property: ts.ObjectLiteralElementLike): boolean {
  if (!ts.isPropertyAssignment(property)) return false;
  const value = property.initializer;
  if (ts.isStringLiteralLike(value)) return true;
  if (!ts.isCallExpression(value)) return false;
  const callee = value.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : '';
  return /^provide[A-Z]/.test(name);
}

/**
 * A service a behaviour test may replace: one that leaves the app.
 *
 * It talks to a server (an HTTP endpoint or a server function, itself or
 * through a primitive it holds), wraps a browser API, or is not the app's own
 * code at all. Mocking anything else ties the test to how the feature is cut
 * today, and the first refactoring breaks it.
 */
export function boundaryServiceNames(
  graph: DependencyGraph,
  sourceRoots: readonly string[],
): ReadonlySet<string> {
  const roots = sourceRoots.map((root) => resolve(graph.rootDir, root));
  const owned = (filePath: string | undefined) =>
    filePath !== undefined &&
    roots.some((root) => resolve(filePath).startsWith(root + sep));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const leavesTheApp = (id: string) =>
    graph.edges.some((edge) => {
      if (edge.from !== id || edge.kind !== 'calls') return false;
      const kind = nodesById.get(edge.to)?.kind;
      return (
        kind === 'http-endpoint' ||
        kind === 'server-function-family' ||
        kind === 'server-function-client'
      );
    });
  const names = new Set<string>();
  for (const service of graph.nodes) {
    if (service.kind !== 'service') continue;
    const held = graph.edges
      .filter((edge) => edge.from === service.id && edge.kind === 'contains')
      .map((edge) => edge.to);
    if (
      !owned(service.filePath) ||
      service.details?.['browserBoundary'] === true ||
      leavesTheApp(service.id) ||
      held.some(leavesTheApp)
    ) {
      names.add(service.label);
    }
  }
  return names;
}

/**
 * Mocks of the app's own services in its tests. A key the graph does not know
 * as a service (a token, path params) is left alone: nothing proves it is not
 * a boundary.
 */
export function behaviorTestMockViolations(
  graph: DependencyGraph,
  options: {
    readonly sourceRoots: readonly string[];
    readonly testFiles: readonly string[];
  },
): BehaviorTestMockViolation[] {
  const boundaries = boundaryServiceNames(graph, options.sourceRoots);
  const services = new Set(
    graph.nodes
      .filter((node) => node.kind === 'service')
      .map((node) => node.label),
  );
  return behaviorTestMocks(graph.rootDir, options.testFiles)
    .filter((mock) => services.has(mock.key) && !boundaries.has(mock.key))
    .map((mock) => ({
      ...mock,
      target: `${mock.file}:${mock.key}` as const,
      message: `${mock.file}:${mock.line}: '${mock.key}' is mocked, but it is the app's own code, not a boundary. Register the real service (provide${capitalize(mock.key)}()) and mock what it calls at the edge (HTTP, server function, browser API).`,
    }));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'tmp',
  '.git',
  '.nx',
  '__sessions__',
]);

/** Every `*.spec.ts` / `*.test.ts` under the given directories. */
export function findBehaviorTestFiles(
  rootDir: string,
  directories: readonly string[],
): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(path);
      } else if (/\.(spec|test)\.[cm]?tsx?$/.test(entry.name)) {
        files.push(relative(rootDir, path).split(sep).join('/'));
      }
    }
  };
  for (const directory of directories) visit(resolve(rootDir, directory));
  return files.sort();
}

export type BehaviorObligationsOptions = BehaviorCatalogOptions & {
  /** The catalog committed on the base branch; `undefined` skips the ratchet. */
  readonly base: BehaviorCatalog | undefined;
  readonly waivers?: readonly BehaviorWaiver[];
  /** Spec files, relative to the graph root, checked for mocks. */
  readonly testFiles?: readonly string[];
  /** Test id → trace, for the tests as they are now. */
  readonly traces?: Readonly<Record<string, BehaviorTraceLike>>;
  /** The same tests at the base, read against the base catalog. */
  readonly baseTraces?: Readonly<Record<string, BehaviorTraceLike>>;
};

export type BehaviorObligationsReport = {
  readonly catalog: BehaviorCatalog;
  readonly ratchet: BehaviorRatchetReport;
  readonly proofs: BehaviorProofIndex;
  /** Obligations proven / in the catalog: shown, never enforced. */
  readonly coverage: { readonly proven: number; readonly total: number };
  readonly violations: readonly string[];
  /** Tests that proved something on the base and prove nothing now. */
  readonly warnings: readonly string[];
};

/**
 * Everything lot 1 checks, in one report: the catalog can be generated
 * without guessing, no new obligation arrives without proof or waiver, every
 * waiver still waives something, and tests mock only boundaries.
 */
export function behaviorObligationsReport(
  graph: DependencyGraph,
  options: BehaviorObligationsOptions,
): BehaviorObligationsReport {
  const { catalog, problems } = buildBehaviorCatalog(graph, options);
  const proofs = behaviorProofIndex(catalog, options.traces ?? {});
  const baseProofs =
    options.base && options.baseTraces
      ? behaviorProofIndex(options.base, options.baseTraces)
      : {};
  const proven = provenBehaviors(proofs);
  const ratchet = behaviorRatchet({
    base: options.base,
    next: catalog,
    waivers: options.waivers,
    proven,
    baseProven: provenBehaviors(baseProofs),
  });
  const violations = [
    ...problems.map((problem) => problem.message),
    ...ratchet.waiverProblems,
    ...ratchet.unproven.map(
      (id) =>
        `New behaviour '${id}' has no proof. Cover it with a test, or add a reasoned { rule: 'behavior-unproven', target: '${id}' } to architecture/behavior-waivers.ts.`,
    ),
    ...ratchet.lost.map(
      (id) =>
        `Behaviour '${id}' was proven on the base and is not any more: the test that covered it was removed or no longer reaches it. Restore the proof, or waive it with a reason.`,
    ),
  ];
  const removed = new Set(ratchet.diff?.removed ?? []);
  const warnings = Object.entries(baseProofs)
    .filter(
      ([test, before]) =>
        before.length > 0 &&
        before.every((id) => removed.has(id)) &&
        (proofs[test]?.length ?? 0) === 0,
    )
    .map(
      ([test]) =>
        `Test '${test}' only proved behaviours that are gone: delete it, unless it is kept for another reason.`,
    );

  const mockViolations = behaviorTestMockViolations(graph, {
    sourceRoots: options.sourceRoots,
    testFiles: options.testFiles ?? [],
  });
  const mockWaivers = (options.waivers ?? []).filter(
    (waiver) => waiver.rule === 'behavior-test-mocks-boundaries',
  );
  for (const violation of mockViolations) {
    if (!mockWaivers.some((waiver) => waiver.target === violation.target))
      violations.push(violation.message);
  }
  for (const waiver of mockWaivers) {
    const label = `waiver ${waiver.rule} → ${waiver.target}`;
    if (!waiver.reason?.trim())
      violations.push(`${label}: the reason is empty.`);
    else if (!mockViolations.some((violation) => violation.target === waiver.target))
      violations.push(
        `${label} is stale: nothing mocks it any more. Remove it from architecture/behavior-waivers.ts.`,
      );
  }

  return {
    catalog,
    ratchet,
    proofs,
    coverage: { proven: proven.size, total: catalog.behaviors.length },
    violations,
    warnings,
  };
}

export function assertBehaviorObligations(
  graph: DependencyGraph,
  options: BehaviorObligationsOptions,
): BehaviorObligationsReport {
  const report = behaviorObligationsReport(graph, options);
  for (const warning of report.warnings)
    console.warn(`[craft behaviours] ${warning}`);
  if (report.violations.length > 0)
    throw new Error(report.violations.join('\n'));
  return report;
}
