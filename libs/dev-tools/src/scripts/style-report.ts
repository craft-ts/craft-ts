/**
 * The three questions worth asking a style graph from outside.
 *
 * Pure: a dump in, an answer out. The CLI and the MCP tools are both thin
 * wrappers over this, so a question asked from an editor and the same question
 * asked in CI cannot give different answers.
 */
import {
  mergeStyleDump,
  type MergeStyleOptions,
  type StyleDump,
} from './style-graph.ts';
import {
  danglingVars,
  dischargers,
  extractionGaps,
  impactedClasses,
  matrixSize,
  matrixSizeByComponent,
  propertiesWrittenBy,
  undischargedObligations,
  unproven,
  varsWrittenBy,
} from './style-architecture.ts';
import type { DependencyGraph } from './dependency-graph.ts';

const bare = (dump: StyleDump, options: MergeStyleOptions): DependencyGraph =>
  mergeStyleDump(
    {
      version: 1,
      rootDir: '.',
      tsConfigFilePath: '.',
      nodes: [],
      edges: [],
    },
    dump,
    options,
  );

export interface StyleImpactReport {
  readonly changed: readonly string[];
  /** Sheet classes a change to those variables can be seen in. */
  readonly classes: readonly string[];
  /**
   * Whether the answer is a real narrowing or the conservative fallback.
   *
   * A name the graph does not know reaches everything: saying "all" out loud is
   * the difference between a suite that skips captures on purpose and one that
   * skips them by accident.
   */
  readonly narrowed: boolean;
}

export function styleImpact(
  dump: StyleDump,
  changed: readonly string[],
): StyleImpactReport {
  const graph = bare(dump, {});
  const known = new Set(dump.vars.map((declaration) => declaration.name));
  const unknown = changed.filter((name) => !known.has(name));
  return {
    changed: [...changed].sort(),
    classes: unknown.length
      ? dump.classes.map((registered) => registered.key).sort()
      : impactedClasses(graph, changed),
    narrowed: unknown.length === 0,
  };
}

export interface StyleMatrixReport {
  readonly bySheet: Readonly<Record<string, number>>;
  readonly byComponent: Readonly<Record<string, number>>;
  readonly total: number;
  readonly median: number;
  readonly largest: { readonly key: string; readonly size: number } | undefined;
}

/**
 * What the application costs to capture.
 *
 * The median and the largest are here because those are the two numbers the
 * plan gates the reduction wave on — reading them off a list by hand is how a
 * threshold quietly stops being checked.
 */
export function styleMatrix(
  dump: StyleDump,
  options: MergeStyleOptions = {},
): StyleMatrixReport {
  const graph = bare(dump, options);
  const bySheet = matrixSize(graph);
  const sizes = Object.values(bySheet).sort((left, right) => left - right);
  const largestEntry = Object.entries(bySheet).sort(
    ([, left], [, right]) => right - left,
  )[0];
  return {
    bySheet,
    byComponent: matrixSizeByComponent(graph),
    total: sizes.reduce((sum, size) => sum + size, 0),
    median: sizes.length
      ? (sizes[(sizes.length - 1) >> 1] + sizes[sizes.length >> 1]) / 2
      : 0,
    largest: largestEntry
      ? { key: largestEntry[0], size: largestEntry[1] }
      : undefined,
  };
}

export interface StyleDebtReport {
  /** Escape hatches taken, with the reason their author gave. */
  readonly unproven: readonly string[];
  /** Required somewhere, discharged nowhere. */
  readonly undischarged: readonly string[];
  readonly dischargers: readonly string[];
  readonly unreadVars: readonly string[];
  readonly undeclaredVars: readonly string[];
  /** Components no sheet is known to style — read this before the rest. */
  readonly extractionGaps: readonly string[];
  /** Axes that move a box, by axis. An axis meant to repaint must be absent. */
  readonly axesTouchingLayout: Readonly<Record<string, readonly string[]>>;
  readonly axesWritingVars: Readonly<Record<string, readonly string[]>>;
}

export function styleDebt(
  dump: StyleDump,
  options: MergeStyleOptions = {},
): StyleDebtReport {
  const graph = bare(dump, options);
  const dangling = danglingVars(graph);
  return {
    unproven: unproven(graph),
    undischarged: undischargedObligations(graph),
    dischargers: dischargers(graph),
    unreadVars: dangling.unread,
    undeclaredVars: dangling.undeclared,
    extractionGaps: extractionGaps(graph),
    axesTouchingLayout: propertiesWrittenBy(graph),
    axesWritingVars: varsWrittenBy(graph),
  };
}
