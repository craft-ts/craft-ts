/**
 * What the digest can decide without an eye.
 *
 * This is where the digest pays for itself. Overflow, truncation, overlap,
 * contrast and touch targets are the bulk of what someone was squinting at a
 * screenshot for, and every one of them is a comparison of numbers. So they are
 * **failures**, not queue items: nobody is asked, the suite goes red, and the
 * message names the node and the pixel count.
 *
 * The distinction matters more than it looks. A review queue is a scarce
 * resource — every item spent on something a machine could have decided is an
 * item that will be stamped rather than read, and the ones that needed a person
 * get stamped alongside them.
 */
import {
  AA_NORMAL_TEXT,
  contrastRatio,
  parseColorChannels,
  relativeLuminance as luminanceOf,
} from '@craft-ts/dev-tools/contrast';
import type { LayoutDigest, LayoutNode } from './digest.js';

export interface LayoutViolation {
  readonly rule:
    | 'overflow-inline'
    | 'overflow-block'
    | 'text-clipped'
    | 'overlap'
    | 'contrast'
    | 'touch-target';
  readonly path: string;
  readonly message: string;
  /** How far past the threshold, in the rule's own unit. */
  readonly amount: number;
}

export interface AssertionOptions {
  /** Minimum contrast ratio. WCAG AA for body text. */
  readonly contrast?: number;
  /** Minimum touch target, in CSS pixels. */
  readonly touchTarget?: number;
  /** Paths excluded from a rule, with the reason kept in the code. */
  readonly ignore?: Readonly<Partial<Record<LayoutViolation['rule'], readonly string[]>>>;
}

/**
 * The thresholds, re-exported from the vocabulary.
 *
 * `AA_CONTRAST` stays spelled here because it is the name every existing
 * caller passes to `AssertionOptions`; the number itself comes from
 * `@craft-ts/dev-tools/contrast`, where the shared WCAG arithmetic lives — so
 * the digest and the static solver cannot disagree about what AA means. That
 * module's header explains why the root of the project graph is the only
 * place both of them can reach; the **subpath** is why importing it here does
 * not drag ts-morph and `node:fs` into a jsdom suite.
 */
export const AA_CONTRAST = AA_NORMAL_TEXT;
export const MIN_TOUCH_TARGET = 24;

/* ------------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------------ */

/**
 * The colour helpers are the vocabulary's, aliased rather than reimplemented.
 *
 * There were two copies of the WCAG arithmetic in this repository, and two
 * copies of a formula are two answers waiting to disagree — the one that
 * matters here being the digest calling a pair readable that the static
 * solver fails. The names stay for the callers that already import them.
 */
export const parseColor = parseColorChannels;
export const relativeLuminance = luminanceOf;
export { contrastRatio };

/* ------------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------------ */

const isIgnored = (
  options: AssertionOptions,
  rule: LayoutViolation['rule'],
  path: string,
): boolean => Boolean(options.ignore?.[rule]?.includes(path));

/**
 * The background a node sits on.
 *
 * Walks up until something is not transparent, because a node almost never
 * paints its own background and comparing text against `rgba(0,0,0,0)` reports
 * every label in the application as unreadable.
 */
function backgroundBehind(
  node: LayoutNode,
  nodes: readonly LayoutNode[],
): string | undefined {
  const own = parseColor(node.styles['background-color']);
  if (own && own[3] > 0) return node.styles['background-color'];
  const ancestors = nodes
    .filter((other) => node.path.startsWith(`${other.path}/`))
    .sort((left, right) => right.path.length - left.path.length);
  for (const ancestor of ancestors) {
    const color = parseColor(ancestor.styles['background-color']);
    if (color && color[3] > 0) return ancestor.styles['background-color'];
  }
  return undefined;
}

export function findViolations(
  digest: LayoutDigest,
  options: AssertionOptions = {},
): readonly LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  const minimumContrast = options.contrast ?? AA_CONTRAST;

  for (const node of digest.nodes) {
    if (node.overflow.inline && !isIgnored(options, 'overflow-inline', node.path)) {
      const amount = node.text?.clipped ?? 0;
      violations.push({
        rule: 'overflow-inline',
        path: node.path,
        amount,
        message: `${node.path} overflows its box by ${amount}px horizontally.`,
      });
    }
    if (node.overflow.block && !isIgnored(options, 'overflow-block', node.path)) {
      violations.push({
        rule: 'overflow-block',
        path: node.path,
        amount: 0,
        message: `${node.path} overflows its box vertically.`,
      });
    }
    if (
      node.text &&
      node.text.clipped > 0 &&
      !isIgnored(options, 'text-clipped', node.path)
    ) {
      violations.push({
        rule: 'text-clipped',
        path: node.path,
        amount: node.text.clipped,
        message: `${node.path} hides ${node.text.clipped}px of "${node.text.content}".`,
      });
    }

    if (node.text && !isIgnored(options, 'contrast', node.path)) {
      const background = backgroundBehind(node, digest.nodes);
      const ratio =
        background === undefined
          ? undefined
          : contrastRatio(node.styles.color, background);
      if (ratio !== undefined && ratio < minimumContrast) {
        violations.push({
          rule: 'contrast',
          path: node.path,
          amount: Number((minimumContrast - ratio).toFixed(2)),
          message: `${node.path} has a contrast of ${ratio.toFixed(2)}:1 against ${background}, below ${minimumContrast}:1.`,
        });
      }
    }
  }

  for (const [left, right] of digest.signature.overlaps) {
    if (isIgnored(options, 'overlap', left) || isIgnored(options, 'overlap', right)) {
      continue;
    }
    violations.push({
      rule: 'overlap',
      path: left,
      amount: 0,
      message: `${left} and ${right} are siblings on the same layer and their boxes intersect.`,
    });
  }

  return violations.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.rule.localeCompare(right.rule),
  );
}

/**
 * Touch targets, checked only where a target exists.
 *
 * Separate from `findViolations` because the digest cannot tell an interactive
 * element from a decorative one; the caller names them, and naming nothing
 * checks nothing rather than checking everything and being wrong.
 */
export function findSmallTargets(
  digest: LayoutDigest,
  interactive: readonly string[],
  options: AssertionOptions = {},
): readonly LayoutViolation[] {
  const minimum = options.touchTarget ?? MIN_TOUCH_TARGET;
  const wanted = new Set(interactive);
  return digest.nodes
    .filter((node) => wanted.has(node.path))
    .flatMap((node) => {
      const [, , width, height] = node.box;
      const smallest = Math.min(width, height);
      if (smallest >= minimum) return [];
      return [
        {
          rule: 'touch-target' as const,
          path: node.path,
          amount: Number((minimum - smallest).toFixed(1)),
          message: `${node.path} is ${width}×${height}px, ${(minimum - smallest).toFixed(1)}px under the ${minimum}px minimum.`,
        },
      ];
    });
}

/**
 * Fails the run, naming the node and the number.
 *
 * "The layout is broken" is not an actionable report. "`userCard/title` hides
 * 34px of 'Benutzerkontoeinstellungen'" is.
 */
export function assertNoLayoutViolations(
  digest: LayoutDigest,
  options: AssertionOptions & { readonly scenario?: string } = {},
): void {
  const violations = findViolations(digest, options);
  if (violations.length === 0) return;
  throw new Error(
    [
      `assertNoLayoutViolations: ${violations.length} problem(s) the digest can prove${
        options.scenario ? ` in '${options.scenario}'` : ''
      }.`,
      ...violations.map((violation) => `  ${violation.message}`),
      '  None of these needs a human: they are measurements, not judgements.',
    ].join('\n'),
  );
}
