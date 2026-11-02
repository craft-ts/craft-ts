/**
 * Semantic mutants: is a proof discriminating?
 *
 * A test proves an obligation when its trace shows the behaviour ran and an
 * assertion came after (`behavior-proofs.ts`). That does not say the assertion
 * looked at the behaviour. A mutant breaks the behaviour at runtime — the
 * invocation does nothing, or its typed exception becomes a success — and
 * reruns only the tests whose fingerprint proves it: if they all still pass,
 * the mutant SURVIVED and the proof is hollow.
 *
 * Only the service and template tests are mutated here (their fingerprints
 * come from `.craft/behavior-proofs.json`): an e2e run per mutant does not fit
 * a PR budget. The mutant itself is applied by the vitest setup file of
 * `@craft-ts/core`, which reads it from `CRAFT_BEHAVIOR_MUTANT`.
 *
 * - The tests run once unmutated first: a red baseline concludes nothing.
 * - A mutant the tests never reached (a stale index) is reported as such,
 *   never as survived nor killed.
 * - Each result is cached by the hash of the mutant, its tests and the app's
 *   sources: an unchanged app reruns nothing.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { BehaviorCatalog, BehaviorKind } from './behavior-catalog.ts';
import { behaviorProofSteps, type BehaviorTraceLike } from './behavior-proofs.ts';

export const BEHAVIOR_MUTANT_CACHE = '.craft/behavior-mutants.json';

export type BehaviorMutantMode = 'skip' | 'succeed';

export type BehaviorMutantPlan = {
  readonly obligation: string;
  readonly mode: BehaviorMutantMode;
  /** The step keys that prove the obligation, as the tests recorded them. */
  readonly keys: readonly string[];
  /** Test file → full names (without the file) of the tests that prove it. */
  readonly tests: Readonly<Record<string, readonly string[]>>;
};

export type BehaviorMutantOutcome = 'killed' | 'survived' | 'not-reached';

export type BehaviorMutantResult = {
  readonly obligation: string;
  readonly mode: BehaviorMutantMode;
  readonly outcome: BehaviorMutantOutcome;
  readonly cached: boolean;
};

export type BehaviorMutantRun = {
  /** `red`: the tests fail unmutated, nothing was concluded. */
  readonly baseline: 'green' | 'red' | 'skipped';
  /** The output of a red baseline. */
  readonly output?: string;
  readonly results: readonly BehaviorMutantResult[];
};

/** Runs the given tests, with `mutant` applied, and says how it went. */
export type BehaviorMutantRunner = (
  request: Readonly<{
    mutant: Readonly<{ keys: readonly string[]; mode: BehaviorMutantMode }>;
    tests: Readonly<Record<string, readonly string[]>>;
  }>,
) => { readonly passed: boolean; readonly applied: boolean; readonly output: string };

/** How each kind of obligation is broken; the others are not mutated here. */
const MUTANT_MODES: Partial<Record<BehaviorKind, BehaviorMutantMode>> = {
  method: 'skip',
  mutation: 'skip',
  command: 'skip',
  'async-process': 'skip',
  'state-machine': 'skip',
  'http-exception': 'succeed',
};

const SEPARATOR = ' > ';

/**
 * One mutant per obligation the unit tests prove, restricted to
 * `obligations` when given. `traces` are keyed `<test file> > <full name>`,
 * as `readBehaviorProofIndex` returns them.
 */
export function planBehaviorMutants(
  catalog: BehaviorCatalog,
  traces: Readonly<Record<string, BehaviorTraceLike>>,
  options: Readonly<{ obligations?: ReadonlySet<string> }> = {},
): BehaviorMutantPlan[] {
  const modes = new Map(
    catalog.behaviors.flatMap((entry) => {
      const mode = MUTANT_MODES[entry.kind];
      return mode ? [[entry.id, mode] as const] : [];
    }),
  );
  const plans = new Map<string, { keys: Set<string>; tests: Map<string, Set<string>> }>();
  for (const [test, trace] of Object.entries(traces)) {
    const cut = test.indexOf(SEPARATOR);
    if (cut < 0) continue;
    const file = test.slice(0, cut);
    const name = test.slice(cut + SEPARATOR.length);
    for (const [obligation, keys] of behaviorProofSteps(catalog, trace)) {
      if (!modes.has(obligation)) continue;
      if (options.obligations && !options.obligations.has(obligation)) continue;
      const plan = plans.get(obligation) ?? { keys: new Set(), tests: new Map() };
      for (const key of keys) plan.keys.add(key);
      plan.tests.set(file, (plan.tests.get(file) ?? new Set()).add(name));
      plans.set(obligation, plan);
    }
  }
  return [...plans]
    .sort(([left], [right]) => compare(left, right))
    .map(([obligation, plan]) => ({
      obligation,
      mode: modes.get(obligation) ?? 'skip',
      keys: [...plan.keys].sort(),
      tests: Object.fromEntries(
        [...plan.tests]
          .sort(([left], [right]) => compare(left, right))
          .map(([file, names]) => [file, [...names].sort()]),
      ),
    }));
}

type MutantCache = {
  version: 1;
  results: Record<string, { hash: string; outcome: BehaviorMutantOutcome }>;
};

function readCache(path: string): MutantCache {
  if (!existsSync(path)) return { version: 1, results: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<MutantCache>;
    return { version: 1, results: parsed.version === 1 && parsed.results ? parsed.results : {} };
  } catch {
    return { version: 1, results: {} };
  }
}

/**
 * Runs the mutants of `plans`. A cached result whose hash still matches is
 * reused; the others need a green baseline first.
 */
export function runBehaviorMutants(
  options: Readonly<{
    rootDir: string;
    plans: readonly BehaviorMutantPlan[];
    /** Hashed with the tests: a change under them invalidates the cache. */
    sourceRoots: readonly string[];
    runner: BehaviorMutantRunner;
    cacheFile?: string;
  }>,
): BehaviorMutantRun {
  const cacheFile = resolve(options.rootDir, options.cacheFile ?? BEHAVIOR_MUTANT_CACHE);
  const cache = readCache(cacheFile);
  const sources = sourcesHash(options.rootDir, options.sourceRoots);
  const hashOf = (plan: BehaviorMutantPlan) =>
    createHash('sha256').update(JSON.stringify(plan)).update(sources).digest('hex');

  const pending = options.plans.filter(
    (plan) => cache.results[plan.obligation]?.hash !== hashOf(plan),
  );
  let baseline: BehaviorMutantRun['baseline'] = 'skipped';
  if (pending.length > 0) {
    const tests: Record<string, string[]> = {};
    for (const plan of pending)
      for (const [file, names] of Object.entries(plan.tests))
        tests[file] = [...new Set([...(tests[file] ?? []), ...names])];
    // An empty mutant changes nothing: the tests as they are.
    const run = options.runner({ mutant: { keys: [], mode: 'skip' }, tests });
    if (!run.passed) return { baseline: 'red', output: run.output, results: [] };
    baseline = 'green';
  }

  const results = options.plans.map((plan): BehaviorMutantResult => {
    const hash = hashOf(plan);
    const cached = cache.results[plan.obligation];
    if (cached?.hash === hash)
      return { obligation: plan.obligation, mode: plan.mode, outcome: cached.outcome, cached: true };
    const run = options.runner({ mutant: { keys: plan.keys, mode: plan.mode }, tests: plan.tests });
    const outcome: BehaviorMutantOutcome = !run.applied
      ? 'not-reached'
      : run.passed
        ? 'survived'
        : 'killed';
    cache.results[plan.obligation] = { hash, outcome };
    return { obligation: plan.obligation, mode: plan.mode, outcome, cached: false };
  });
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(
    cacheFile,
    `${JSON.stringify({ version: 1, results: sortedRecord(cache.results) }, null, 2)}\n`,
  );
  return { baseline, results };
}

/**
 * The default runner: `vitest run` on the app's config, stopping at the
 * first failure. The setup file of `@craft-ts/core` must be in its
 * `setupFiles`: it applies the mutant and skips the tests not listed.
 */
export function vitestMutantRunner(
  options: Readonly<{ rootDir: string; config: string }>,
): BehaviorMutantRunner {
  const rootDir = resolve(options.rootDir);
  const require = createRequire(join(rootDir, 'package.json'));
  const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  return ({ mutant, tests }) => {
    const dir = mkdtempSync(join(tmpdir(), 'craft-mutant-'));
    const appliedFile = join(dir, 'applied');
    try {
      const result = spawnSync(
        process.execPath,
        [
          vitest,
          'run',
          '--config',
          resolve(rootDir, options.config),
          '--bail=1',
          '--reporter=dot',
          ...Object.keys(tests).map((file) => join(rootDir, file)),
        ],
        {
          cwd: rootDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            CRAFT_BEHAVIOR_MUTANT: JSON.stringify({ ...mutant, root: rootDir, tests, appliedFile }),
          },
        },
      );
      return {
        passed: result.status === 0,
        applied: existsSync(appliedFile),
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

/**
 * The obligations a change touches: new since the base catalog, declared in
 * a changed file, or proven by a changed test file. Every obligation when
 * there is no base to compare with.
 */
export function changedBehaviorObligations(
  options: Readonly<{
    rootDir: string;
    catalog: BehaviorCatalog;
    base: BehaviorCatalog | undefined;
    traces: Readonly<Record<string, BehaviorTraceLike>>;
    baseRef?: readonly string[];
  }>,
): Set<string> {
  const all = new Set(options.catalog.behaviors.map((entry) => entry.id));
  const changed = changedFiles(options.rootDir, options.baseRef);
  if (!options.base || !changed) return all;
  const before = new Set(options.base.behaviors.map((entry) => entry.id));
  const touched = new Set<string>();
  for (const entry of options.catalog.behaviors) {
    if (!before.has(entry.id) || (entry.file && changed.has(entry.file))) touched.add(entry.id);
  }
  for (const [test, trace] of Object.entries(options.traces)) {
    if (!changed.has(test.slice(0, test.indexOf(SEPARATOR)))) continue;
    for (const obligation of behaviorProofSteps(options.catalog, trace).keys()) touched.add(obligation);
  }
  return touched;
}

/** Files changed since the merge base, relative to `rootDir`; `undefined` without one. */
function changedFiles(rootDir: string, baseRef?: readonly string[]): Set<string> | undefined {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const refs = baseRef ?? [process.env['CRAFT_BEHAVIOR_BASE'] ?? 'main', 'origin/main'];
  for (const ref of refs) {
    try {
      const base = git('merge-base', 'HEAD', ref).trim();
      const lines = [
        ...git('diff', '--name-only', '--relative', base, '--', '.').split('\n'),
        ...git('ls-files', '--others', '--exclude-standard').split('\n'),
      ];
      return new Set(lines.filter(Boolean));
    } catch {
      // Unknown ref: try the next one.
    }
  }
  return undefined;
}

function sourcesHash(rootDir: string, sourceRoots: readonly string[]): string {
  const hash = createHash('sha256');
  const visit = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') visit(path);
      } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        hash.update(relative(rootDir, path).split(sep).join('/')).update('\0').update(readFileSync(path));
      }
    }
  };
  for (const root of sourceRoots) visit(resolve(rootDir, root));
  return hash.digest('hex');
}

/** One line per result, the hollow proofs first. */
export function formatBehaviorMutantRun(run: BehaviorMutantRun): string {
  if (run.baseline === 'red')
    return `Les tests échouent sans mutant : rien n'est conclu.\n${run.output ?? ''}`;
  const order: Record<BehaviorMutantOutcome, number> = { survived: 0, 'not-reached': 1, killed: 2 };
  const label: Record<BehaviorMutantOutcome, string> = {
    survived: 'SURVIVANT',
    'not-reached': 'non atteint',
    killed: 'tué',
  };
  const lines = [...run.results]
    .sort((left, right) => order[left.outcome] - order[right.outcome] || compare(left.obligation, right.obligation))
    .map(
      (result) =>
        `${label[result.outcome].padEnd(11)} ${result.obligation} (${result.mode})${result.cached ? ' [cache]' : ''}`,
    );
  const count = (outcome: BehaviorMutantOutcome) =>
    run.results.filter((result) => result.outcome === outcome).length;
  lines.push(
    `${count('killed')} tué(s), ${count('survived')} survivant(s), ${count('not-reached')} non atteint(s) sur ${run.results.length} mutant(s).`,
  );
  return lines.join('\n');
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => compare(left, right)));
}
