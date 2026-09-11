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
  type StyleDumpProvenance,
} from './style-graph.ts';
import type { TextContrastResult } from './style-contrast.ts';
import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  contrastRatioOf,
  meetsContrast,
  parseCssColor,
} from './contrast.ts';
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

/* ------------------------------------------------------------------------ *
 * The palette matrix
 * ------------------------------------------------------------------------ */

export type PaletteVerdict = 'pass' | 'fail' | 'unresolved';

export interface PaletteContrastSide {
  /** Absent when one of the two colours is not one this module can read. */
  readonly ratio?: number;
  readonly normalText: PaletteVerdict;
  readonly largeText: PaletteVerdict;
}

export interface PaletteContrastPair {
  readonly foreground: string;
  readonly background: string;
  readonly light: PaletteContrastSide;
  readonly dark: PaletteContrastSide;
  /**
   * Where the pair is actually rendered, from the contrast analysis.
   *
   * `undefined` when no analysis was supplied — which is the case for
   * `craft-graph --palette-contrast`, since that command deliberately does not
   * build the program. Absent and empty are different answers and the
   * distinction is the point: `[]` means "the analysis looked and found
   * nowhere", `undefined` means "nobody looked".
   */
  readonly usedBy?: readonly string[];
}

export interface PaletteContrastOptions {
  /** Roles eligible as text. Defaults to `text`. */
  readonly foregroundRoles?: readonly string[];
  /** Roles eligible as a surface behind text. Defaults to `surface` and `accent`. */
  readonly backgroundRoles?: readonly string[];
  /**
   * Results from `analyzeTextContrast`, to fill in `usedBy`.
   *
   * The link is made from resolved *results* rather than from the dump,
   * because co-occurrence in a sheet is not usage: `dsTheme-root` writes
   * `ui.text.onAccent` and `ui.surface.page` into two different variables and
   * puts neither on top of the other. Only the solver knows which pairs an
   * element is actually painted in.
   */
  readonly usages?: readonly TextContrastResult[];
}

/**
 * Every pair the palette can express, with its two ratios. **Informative.**
 *
 * This is the answer to "what does my palette allow", and it is deliberately
 * not a gate. A palette of twenty tokens has hundreds of pairs and an
 * application uses a few dozen; failing a build on a combination nobody
 * renders trains people to switch the check off, and takes the real failures
 * with it. `analyzeTextContrast` in `style-contrast.ts` is the blocking half,
 * and it reports on pairs an element can actually be rendered in.
 *
 * What this table is good for is the design conversation before that: seeing
 * that `text.onAccent` over `accent.warning` is 3.8:1 tells you the token pair
 * is only ever safe on large text, which is a decision to take once rather
 * than a failure to chase per component. `usedBy` is what connects the two —
 * a pair that fails and is rendered somewhere is worth looking at first — and
 * it is filled in only when the caller supplies the analysis, because usage
 * is a fact about templates and this function is handed a dump.
 */
export function paletteContrastMatrix(
  dump: StyleDump,
  options: PaletteContrastOptions = {},
): readonly PaletteContrastPair[] {
  const foregroundRoles = new Set(options.foregroundRoles ?? ['text']);
  const backgroundRoles = new Set(
    options.backgroundRoles ?? ['surface', 'accent'],
  );

  const tokens = new Map<string, StyleDumpProvenance>();
  const record = (provenance: StyleDumpProvenance | undefined) => {
    if (!provenance) return;
    // `side` is dropped from the key: `darkOf(ui.text.strong)` is the same
    // token seen from the other side, and listing it twice would double every
    // row of the table for no new information.
    const key = `${provenance.palette}.${provenance.group}.${provenance.token}`;
    if (!tokens.has(key)) tokens.set(key, { ...provenance, side: 'light' });
  };
  for (const atom of dump.atoms) record(atom.provenance);
  for (const declaration of dump.vars) record(declaration.initialProvenance);

  const usage = options.usages ? renderedPairs(options.usages) : undefined;
  const pairs: PaletteContrastPair[] = [];
  for (const [foregroundName, foreground] of tokens) {
    if (!foregroundRoles.has(foreground.role)) continue;
    for (const [backgroundName, background] of tokens) {
      if (!backgroundRoles.has(background.role)) continue;
      pairs.push({
        foreground: foregroundName,
        background: backgroundName,
        light: sideOf(foreground.light, background.light),
        dark: sideOf(foreground.dark, background.dark),
        ...(usage
          ? {
              usedBy: [
                ...(usage.get(`${foregroundName}|${backgroundName}`) ?? []),
              ].sort(),
            }
          : {}),
      });
    }
  }
  return pairs.sort(
    (left, right) =>
      left.foreground.localeCompare(right.foreground) ||
      left.background.localeCompare(right.background),
  );
}

function sideOf(foreground: string, background: string): PaletteContrastSide {
  const one = parseCssColor(foreground);
  const other = parseCssColor(background);
  if (one.kind === 'unsupported' || other.kind === 'unsupported') {
    // Unresolved and not "fail": a token this module cannot read says nothing
    // about the pair, and reporting it as a failure would be a made-up number.
    return { normalText: 'unresolved', largeText: 'unresolved' };
  }
  const ratio = contrastRatioOf(one.rgb, other.rgb);
  return {
    ratio,
    normalText: meetsContrast(ratio, AA_NORMAL_TEXT) ? 'pass' : 'fail',
    largeText: meetsContrast(ratio, AA_LARGE_TEXT) ? 'pass' : 'fail',
  };
}

/** `foreground|background` → the elements the solver resolved it on. */
function renderedPairs(
  results: readonly TextContrastResult[],
): Map<string, Set<string>> {
  const usage = new Map<string, Set<string>>();
  for (const result of results) {
    if (result.kind !== 'resolved') continue;
    const foreground = result.foreground.token;
    const background = result.background.token;
    if (!foreground || !background) continue;
    // Both sides are recorded on the light-side name, matching the table's
    // own key: `ui.text.onAccent.dark` and `ui.text.onAccent` are one token.
    const key = `${baseToken(foreground)}|${baseToken(background)}`;
    const places = usage.get(key) ?? new Set<string>();
    places.add(`${result.component}/${result.element}`);
    usage.set(key, places);
  }
  return usage;
}

const baseToken = (name: string): string =>
  name.endsWith('.dark') ? name.slice(0, -'.dark'.length) : name;
