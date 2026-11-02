/**
 * The coverage of an app's behaviours, for a reader: each obligation of the
 * catalog with what stands behind it — the tests that prove it, the waiver
 * that excuses it, whether its mutant was killed — and how to recognise it in
 * a recorded session.
 *
 * The architecture suite writes it next to the proof index,
 * `.craft/behavior-coverage.json` (out of git, derived); the log server reads
 * it and looks for each unproven obligation in the debug sessions it holds,
 * so that the dashboard can say which ones were seen and never tested.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  BehaviorKind,
  BehaviorObligationsReport,
  BehaviorWaiver,
} from './behavior-catalog.ts';
import {
  BEHAVIOR_MUTANT_CACHE,
  BEHAVIOR_MUTANT_E2E_CACHE,
  type BehaviorMutantOutcome,
} from './behavior-mutants.ts';
import { behaviorStepMatches, type BehaviorStepMatch } from './behavior-proofs.ts';

export const BEHAVIOR_COVERAGE_FILE = '.craft/behavior-coverage.json';

export type BehaviorCoverageEntry = {
  readonly id: string;
  readonly kind: BehaviorKind;
  readonly file?: string;
  readonly status: 'proven' | 'waived' | 'unproven';
  /** The tests whose trace proves it, sorted. */
  readonly provenBy: readonly string[];
  /** The reason of the waiver that excuses it. */
  readonly waiver?: string;
  /** The last `craft mutants` verdict, when one ran. */
  readonly mutant?: BehaviorMutantOutcome;
  /** How a recorded session shows it; absent when nothing names it alone. */
  readonly match?: BehaviorStepMatch;
};

export type BehaviorCoverage = {
  readonly version: 1;
  readonly app: string;
  readonly behaviors: readonly BehaviorCoverageEntry[];
};

export function behaviorCoverage(
  report: BehaviorObligationsReport,
  options: Readonly<{
    app: string;
    waivers?: readonly BehaviorWaiver[];
    mutants?: Readonly<Record<string, BehaviorMutantOutcome>>;
  }>,
): BehaviorCoverage {
  const provenBy = new Map<string, string[]>();
  for (const [test, ids] of Object.entries(report.proofs))
    for (const id of ids) provenBy.set(id, [...(provenBy.get(id) ?? []), test]);
  const waivers = new Map(
    (options.waivers ?? [])
      .filter((waiver) => waiver.rule === 'behavior-unproven')
      .map((waiver) => [waiver.target, waiver.reason] as const),
  );
  const matches = behaviorStepMatches(report.catalog);
  return {
    version: 1,
    app: options.app,
    behaviors: report.catalog.behaviors.map((entry) => {
      const tests = [...(provenBy.get(entry.id) ?? [])].sort();
      const waiver = waivers.get(entry.id);
      const mutant = options.mutants?.[entry.id];
      const match = matches.get(entry.id);
      return {
        id: entry.id,
        kind: entry.kind,
        ...(entry.file ? { file: entry.file } : {}),
        status: tests.length > 0 ? 'proven' : waiver !== undefined ? 'waived' : 'unproven',
        provenBy: tests,
        ...(waiver !== undefined ? { waiver } : {}),
        ...(mutant ? { mutant } : {}),
        ...(match ? { match } : {}),
      };
    }),
  };
}

/**
 * The verdicts `craft mutants` left in its caches, by obligation — the unit
 * one and the e2e one. When both judged an obligation, the worse wins: one
 * hollow proof is enough to say so.
 */
export function readBehaviorMutantOutcomes(
  rootDir: string,
  cacheFiles: readonly string[] = [BEHAVIOR_MUTANT_CACHE, BEHAVIOR_MUTANT_E2E_CACHE],
): Record<string, BehaviorMutantOutcome> {
  const rank: Record<BehaviorMutantOutcome, number> = { survived: 0, killed: 1, 'not-reached': 2 };
  const outcomes: Record<string, BehaviorMutantOutcome> = {};
  for (const cacheFile of cacheFiles) {
    for (const [id, outcome] of Object.entries(readMutantCache(resolve(rootDir, cacheFile)))) {
      const known = outcomes[id];
      if (!known || rank[outcome] < rank[known]) outcomes[id] = outcome;
    }
  }
  return outcomes;
}

function readMutantCache(path: string): Record<string, BehaviorMutantOutcome> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      results?: Record<string, { outcome?: BehaviorMutantOutcome }>;
    };
    return Object.fromEntries(
      Object.entries(parsed.results ?? {}).flatMap(([id, result]) =>
        result.outcome ? [[id, result.outcome]] : [],
      ),
    );
  } catch {
    return {};
  }
}

export function writeBehaviorCoverage(
  rootDir: string,
  coverage: BehaviorCoverage,
  outputFile: string = BEHAVIOR_COVERAGE_FILE,
): void {
  const path = resolve(rootDir, outputFile);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(coverage, null, 2)}\n`);
}
