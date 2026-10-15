/**
 * The architecture rules that make a page's stability a tested property.
 *
 * Nothing fails when a page loops: it keeps drawing, the console stays empty,
 * and the first symptom is a saturated server. The only thing that notices is a
 * test that mounts the page, lets it settle and counts what it did — so these
 * rules require one.
 *
 * - `route-needs-stability-test`: every routed page is mounted by a
 *   `expectRouteToSettle` / `expectPageToSettle` /
 *   `expectPageToSettleInBrowser` call that names its url.
 * - `looping-async-process-needs-budget`: an `asyncProcess` whose loader loops
 *   is named in the `budget.perKey` of such a call, so the number of
 *   iterations a test tolerates is written down.
 *
 * ESLint sees one file and the routes live in another from the tests; the graph
 * knows both the routes and the primitives. Both rules name a target, so a
 * deliberate gap is waived per route or primitive, with a reason.
 */
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { DependencyGraph } from './dependency-graph.ts';
import type { ArchitectureFinding } from './architecture-style-rules.ts';

/** The calls that mount a page and judge its stability. */
export const STABILITY_TEST_CALLS: ReadonlySet<string> = new Set([
  'expectPageToSettle',
  'expectRouteToSettle',
  'expectPageToSettleInBrowser',
]);

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  '.nx',
  'coverage',
  'test-results',
]);
const TEST_FILE = /\.(spec|test|e2e)\.[cm]?[jt]sx?$/;

const location = (graph: DependencyGraph, filePath?: string, line?: number) =>
  filePath
    ? `${relative(graph.rootDir, filePath)}${line ? `:${line}` : ''}: `
    : '';

// ─── test scan ──────────────────────────────────────────────────────────────

/** Every string literal found in the arguments of the stability calls. */
interface StabilityTests {
  readonly literals: readonly string[];
}

const testCache = new WeakMap<DependencyGraph, StabilityTests | undefined>();

function* testFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) yield* testFiles(path);
    else if (TEST_FILE.test(entry)) yield path;
  }
}

function stringsIn(node: ts.Node, into: string[]): void {
  if (ts.isStringLiteralLike(node)) into.push(node.text);
  // `{ 'asyncProcess:follow': { … } }` names the primitive by its key.
  if (ts.isPropertyAssignment(node) && ts.isStringLiteralLike(node.name)) {
    into.push(node.name.text);
  }
  ts.forEachChild(node, (child) => stringsIn(child, into));
}

/**
 * Reads the project's test files once per graph. A graph whose tsconfig is gone
 * (a literal graph in a spec) has no tests to read: the rules then report
 * nothing rather than everything.
 */
function stabilityTests(graph: DependencyGraph): StabilityTests | undefined {
  if (testCache.has(graph)) return testCache.get(graph);
  let tests: StabilityTests | undefined;
  if (existsSync(graph.tsConfigFilePath)) {
    const literals: string[] = [];
    for (const filePath of testFiles(dirname(graph.tsConfigFilePath))) {
      const text = readFileSync(filePath, 'utf8');
      if (![...STABILITY_TEST_CALLS].some((name) => text.includes(name))) {
        continue;
      }
      const source = ts.createSourceFile(
        filePath,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          STABILITY_TEST_CALLS.has(node.expression.text)
        ) {
          for (const argument of node.arguments) stringsIn(argument, literals);
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    tests = { literals };
  }
  testCache.set(graph, tests);
  return tests;
}

// ─── route coverage ─────────────────────────────────────────────────────────

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A route path as a matcher for the tail of a url: `:id` is one segment. */
function routeMatcher(path: string): RegExp | undefined {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return undefined;
  const pattern = segments
    .map((segment) =>
      segment.startsWith(':')
        ? '[^/]+'
        : segment === '**' || segment === '*'
          ? '.*'
          : escapeRegExp(segment),
    )
    .join('/');
  return new RegExp(`(^|/)${pattern}$`);
}

function routeIsCovered(
  path: string,
  label: string,
  literals: readonly string[],
): boolean {
  const matcher = routeMatcher(path);
  return literals.some((literal) => {
    if (literal === label) return true;
    const url = literal.split(/[?#]/, 1)[0].replace(/\/+$/, '');
    // The root page: nothing but `/` can name it.
    if (!matcher) return literal === '/';
    return matcher.test(url.replace(/^\//, ''));
  });
}

/** Every routed page is mounted by a stability test that names its url. */
export function routeNeedsStabilityTestFindings(
  graph: DependencyGraph,
): ArchitectureFinding[] {
  const tests = stabilityTests(graph);
  if (!tests) return [];
  return graph.nodes.flatMap((node) => {
    if (node.kind !== 'route' || node.details?.['hasComponent'] !== true) {
      return [];
    }
    const path = String(node.details?.['path'] ?? '');
    if (path === '<dynamic>' || path === '**') return [];
    if (routeIsCovered(path, node.label, tests.literals)) return [];
    return [
      {
        target: `route:${node.label}`,
        message:
          `${location(graph, node.filePath, node.line)}route ${node.label} ` +
          `has no stability test. A page that loops fails nothing: mount it with ` +
          `expectRouteToSettle(routes, '/${path}') (or expectPageToSettle / ` +
          `expectPageToSettleInBrowser) in a *.spec.ts, or waive it with ` +
          `{ rule: 'route-needs-stability-test', target: 'route:${node.label}', reason }.`,
      },
    ];
  });
}

// ─── looping asyncProcess ───────────────────────────────────────────────────

const isOpenEndedLoop = (node: ts.Node): boolean => {
  if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
    const test = node.expression;
    return (
      test.kind === ts.SyntaxKind.TrueKeyword ||
      containsYieldDelegate(test)
    );
  }
  if (ts.isForStatement(node)) {
    return (
      node.condition === undefined ||
      node.condition.kind === ts.SyntaxKind.TrueKeyword ||
      containsYieldDelegate(node.condition)
    );
  }
  return false;
};

function containsYieldDelegate(node: ts.Node): boolean {
  if (ts.isYieldExpression(node) && node.asteriskToken) return true;
  return ts.forEachChild(node, containsYieldDelegate) ?? false;
}

function containsOpenEndedLoop(node: ts.Node): boolean {
  if (isOpenEndedLoop(node)) return true;
  return ts.forEachChild(node, containsOpenEndedLoop) ?? false;
}

/** Whether the `asyncProcess(...)` call starting at `line` has a looping loader. */
function asyncProcessLoops(filePath: string, line: number): boolean {
  if (!existsSync(filePath)) return false;
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  let loops = false;
  const visit = (node: ts.Node): void => {
    if (loops) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'asyncProcess' &&
      source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 ===
        line
    ) {
      loops = node.arguments.some(containsOpenEndedLoop);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return loops;
}

const budgetNames = (label: string, name: string): readonly string[] => [
  label,
  `asyncProcess:${name}`,
];

function hasBudget(
  label: string,
  name: string,
  literals: readonly string[],
): boolean {
  const names = budgetNames(label, name);
  return literals.some((literal) =>
    literal.endsWith('*')
      ? names.some((candidate) => candidate.startsWith(literal.slice(0, -1)))
      : names.includes(literal),
  );
}

/** An `asyncProcess` that loops names its budget in a stability test. */
export function loopingAsyncProcessNeedsBudgetFindings(
  graph: DependencyGraph,
): ArchitectureFinding[] {
  const tests = stabilityTests(graph);
  if (!tests) return [];
  return graph.nodes.flatMap((node) => {
    if (
      node.kind !== 'primitive' ||
      node.details?.['primitive'] !== 'asyncProcess' ||
      !node.filePath ||
      !node.line ||
      !asyncProcessLoops(node.filePath, node.line)
    ) {
      return [];
    }
    const name = String(node.details?.['name'] ?? node.label);
    if (hasBudget(node.label, name, tests.literals)) return [];
    return [
      {
        target: `primitive:${node.label}`,
        message:
          `${location(graph, node.filePath, node.line)}${node.label} loops ` +
          `(its loader has a while/for driven by yield* or true) but no ` +
          `stability test states how many iterations it may make. Name it in ` +
          `budget.perKey: expectRouteToSettle(routes, url, { budget: { perKey: { ` +
          `'${node.label}': { loaderRuns: 2 } } } }), or waive it with ` +
          `{ rule: 'looping-async-process-needs-budget', target: 'primitive:${node.label}', reason }.`,
      },
    ];
  });
}

export const STABILITY_ARCHITECTURE_RULES = [
  ['route-needs-stability-test', routeNeedsStabilityTestFindings],
  [
    'looping-async-process-needs-budget',
    loopingAsyncProcessNeedsBudgetFindings,
  ],
] as const;
