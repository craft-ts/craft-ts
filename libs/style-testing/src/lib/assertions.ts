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

export const AA_CONTRAST = 4.5;
export const MIN_TOUCH_TARGET = 24;

/* ------------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------------ */

/** `rgb(1, 2, 3)` / `#123` / `#112233` → channels, or nothing. */
export function parseColor(
  value: string,
): readonly [number, number, number, number] | undefined {
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return [0, 0, 0, 0];
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (rgb) {
    const parts = (rgb[1] as string)
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((part) => Number.parseFloat(part));
    const [r, g, b, a] = parts;
    if (r === undefined || g === undefined || b === undefined) return undefined;
    return [r, g, b, a ?? 1];
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (!hex) return undefined;
  const digits = hex[1] as string;
  const expanded =
    digits.length === 3
      ? [...digits].map((digit) => digit + digit).join('')
      : digits;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
    1,
  ];
}

const channel = (value: number): number => {
  const scaled = value / 255;
  return scaled <= 0.03928
    ? scaled / 12.92
    : ((scaled + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (
  color: readonly [number, number, number, number],
): number =>
  0.2126 * channel(color[0]) +
  0.7152 * channel(color[1]) +
  0.0722 * channel(color[2]);

export function contrastRatio(foreground: string, background: string): number | undefined {
  const one = parseColor(foreground);
  const other = parseColor(background);
  if (!one || !other) return undefined;
  const light = Math.max(relativeLuminance(one), relativeLuminance(other));
  const dark = Math.min(relativeLuminance(one), relativeLuminance(other));
  return (light + 0.05) / (dark + 0.05);
}

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
  const minimumTarget = options.touchTarget ?? MIN_TOUCH_TARGET;

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
