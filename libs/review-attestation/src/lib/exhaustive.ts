/**
 * The assertion that a matrix is actually covered.
 *
 * **Post-inference, always.** A self-referential constraint on the component's
 * own declaration resolves the union to `never` and the check silently passes —
 * the same shape as `assertExhaustiveRouteExceptions`, and the same reason.
 * The matrix is computed first, the baselines are read second, and the two are
 * compared as values.
 */
import type { VisualScenario } from './matrix.ts';

export interface CoverageReport {
  /** Scenarios the matrix produced and no baseline covers. */
  readonly missing: readonly string[];
  /** Baselines that no scenario produces any more. */
  readonly orphaned: readonly string[];
  readonly total: number;
}

export const BASELINE_SUFFIX = '.png';

/** Turns a directory listing into the baseline names a matrix is compared to. */
export const baselinesIn = (files: readonly string[]): readonly string[] =>
  files
    .filter((file) => file.endsWith(BASELINE_SUFFIX))
    .map((file) => file.slice(0, -BASELINE_SUFFIX.length))
    .sort();

export function coverageOf(
  scenarios: readonly VisualScenario[],
  baselines: readonly string[],
): CoverageReport {
  const produced = new Set(scenarios.map((scenario) => scenario.id));
  const covered = new Set(baselines);
  return {
    missing: [...produced].filter((id) => !covered.has(id)).sort(),
    orphaned: [...covered].filter((id) => !produced.has(id)).sort(),
    total: produced.size,
  };
}

/**
 * Fails when the matrix and the baselines disagree, in either direction.
 *
 * An orphaned baseline matters as much as a missing one: it is a state the
 * component used to have, and a reviewer looking at the folder would still
 * count it as covered.
 */
export function assertExhaustiveVisualMatrix(
  scenarios: readonly VisualScenario[],
  baselines: readonly string[],
): void {
  const report = coverageOf(scenarios, baselines);
  if (report.missing.length === 0 && report.orphaned.length === 0) return;

  const lines = [
    `assertExhaustiveVisualMatrix: the matrix has ${report.total} scenarios and the baselines do not match it.`,
  ];
  if (report.missing.length) {
    lines.push(
      `  Never captured (${report.missing.length}): ${report.missing.join(', ')}.`,
      '  Each one is a way this component can look that nobody has ever looked at.',
    );
  }
  if (report.orphaned.length) {
    lines.push(
      `  No longer produced (${report.orphaned.length}): ${report.orphaned.join(', ')}.`,
      '  A baseline nothing produces still reads as coverage; delete it or restore the state.',
    );
  }
  throw new Error(lines.join('\n'));
}
