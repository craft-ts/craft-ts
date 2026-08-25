/**
 * The axes an application defines for itself.
 *
 * Four constructors, and each one closes its set at construction: what comes
 * back is a record of points, so a name that does not exist is a missing
 * property rather than a condition the browser silently drops.
 */
import type { AnyKind, SyntaxOf } from '../kinds.ts';
import type { LengthValue } from '../tokens/units.ts';
import { axisPoint, type AxisPoint, type AnyAxisPoint } from './types.ts';

/**
 * A point that sits on an ordered axis, and on which side of it.
 *
 * A plain breakpoint is a lower bound: `bp.md` means "from md up". `above` and
 * `below` make the bound explicit so that an empty intersection — a rule no
 * viewport can ever match — is detectable instead of shipped.
 */
export interface RangePoint<
  Axis extends string,
  Point extends string,
  Bound extends 'above' | 'below' = 'above',
> extends AxisPoint<Axis, Point> {
  readonly order: number;
  readonly bound: Bound;
}

/**
 * Breakpoints take **built conditions**, never strings:
 * `at.minInlineSize(unit.rem(40))` and not `'(min-width: 40rem)'`.
 *
 * They live under `at` because `minInlineSize` is also a CSS property in the
 * generated table. Same collision as `px` the unit versus `px` the padding
 * helper, settled the same way.
 */
export const at = {
  minInlineSize: (value: LengthValue) => ({ minInlineSize: value }),
} as const;

export type BreakpointSpec = { readonly minInlineSize: LengthValue };

export type Breakpoints<
  Points extends Readonly<Record<string, BreakpointSpec>>,
> = {
  readonly [Key in keyof Points & string]: RangePoint<'viewport', Key>;
};

/**
 * Breakpoints are indexed by declaration order.
 *
 * The order is what lets the matrix reduce by interval — two children cutting
 * at `md` and `lg` produce three viewport cells, not four — and what lets a
 * dead rule be recognised. Declare them ascending; nothing else can infer it.
 */
export function defineBreakpoints<
  const Points extends Readonly<Record<string, BreakpointSpec>>,
>(points: Points): Breakpoints<Points> {
  return Object.fromEntries(
    Object.entries(points).map(([name, { minInlineSize }], index) => [
      name,
      axisPoint(
        'viewport',
        name,
        `@media (min-width: ${minInlineSize.css})`,
        {
          kind: 'resize',
          minInlineSize: minInlineSize.css,
        },
        { order: index + 1, bound: 'above' },
      ),
    ]),
  ) as Breakpoints<Points>;
}

/** From this breakpoint up. The same thing a bare breakpoint already means. */
export const above = <Axis extends string, Point extends string>(
  point: RangePoint<Axis, Point, 'above' | 'below'>,
): RangePoint<Axis, Point, 'above'> => ({ ...point, bound: 'above' });

/** Strictly below this breakpoint. */
export const below = <Axis extends string, Point extends string>(
  point: RangePoint<Axis, Point, 'above' | 'below'>,
): RangePoint<Axis, Point, 'below'> => ({
  ...point,
  bound: 'below',
  open: point.open.replace(
    /^@media \(min-width: (.*)\)$/,
    '@media not (min-width: $1)',
  ),
});

// ─── constrained axes ───────────────────────────────────────────────────────

declare const WRITES: unique symbol;

/**
 * An axis that may only write custom properties of one kind.
 *
 * This is the one reduction the matrix can make without analysing anything: an
 * axis constrained to `<color>` cannot move a box, so it crosses additively
 * with the axes that do. The constraint is checked where it is cheap — at the
 * call site of `when` — rather than by reading the emitted CSS afterwards.
 */
export interface ConstrainedAxisPoint<
  Axis extends string,
  Point extends string,
  Syntax extends string,
> extends AxisPoint<Axis, Point> {
  readonly [WRITES]?: Syntax;
}

export type WritesSyntaxOf<Point> = typeof WRITES extends keyof Point
  ? Point extends { readonly [WRITES]?: infer Syntax extends string }
    ? Syntax
    : never
  : never;

/** `defineAxis('theme', [...], { writes: onlyVarsOfKind(kind.color) })`. */
export const onlyVarsOfKind = <Kind extends AnyKind>(
  kind: Kind,
): { readonly writes: readonly [SyntaxOf<Kind>] } =>
  ({ writes: [kind.syntax] }) as never;

export interface AxisOptions<Syntax extends string = never> {
  readonly writes?: readonly [Syntax];
}

export type DefinedAxis<
  Name extends string,
  Values extends readonly string[],
  Syntax extends string,
> = {
  readonly [Value in Values[number]]: [Syntax] extends [never]
    ? AxisPoint<Name, Value>
    : ConstrainedAxisPoint<Name, Value, Syntax>;
};

/**
 * A generic axis driven by an attribute, with an optional write constraint.
 *
 * `defineStateAxis` is this without the constraint; it stays a separate name
 * because a state axis is the common case and reads better without options.
 */
export function defineAxis<
  const Name extends string,
  const Values extends readonly string[],
  const Syntax extends string = never,
>(
  name: Name,
  values: Values,
  options: AxisOptions<Syntax> = {},
): DefinedAxis<Name, Values, Syntax> {
  return Object.fromEntries(
    values.map((value) => [
      value,
      axisPoint(
        name,
        value,
        `&[data-${name}='${value}']`,
        { kind: 'setAttribute', name: `data-${name}`, value },
        options.writes ? { writes: options.writes } : {},
      ),
    ]),
  ) as DefinedAxis<Name, Values, Syntax>;
}

/**
 * A state axis emits `data-{prefix}='{state}'` — something a driver can set and
 * a component can render. An axis whose points nothing can reach has no place
 * in the matrix.
 *
 * The attribute-value form, rather than one attribute per state, is what makes
 * the states mutually exclusive by construction: an element cannot be two of
 * them at once, so the matrix does not have to be told.
 */
export function defineStateAxis<
  const Prefix extends string,
  const States extends readonly string[],
>(prefix: Prefix, states: States): DefinedAxis<Prefix, States, never> {
  return defineAxis(prefix, states);
}

// ─── container axes ─────────────────────────────────────────────────────────

export type ContainerBreakpoints<
  Name extends string,
  Points extends Readonly<Record<string, BreakpointSpec>>,
> = {
  readonly [Key in keyof Points & string]: RangePoint<`container.${Name}`, Key>;
};

export interface ContainerSpec {
  readonly name: string;
  readonly type: 'inline-size' | 'size' | 'scroll-state';
}

/**
 * A container axis is closed at the element that declares the container.
 *
 * It answers "how wide is my box", which nobody above the container can change,
 * so the axis must not propagate past it — otherwise every ancestor inherits
 * scenarios it has no way to affect. The pruning lives in the matrix; this is
 * where the boundary is named.
 */
export function defineContainer<
  const Name extends string,
  const Points extends Readonly<Record<string, BreakpointSpec>>,
>(
  container: { readonly name: Name; readonly type: ContainerSpec['type'] },
  points: Points,
): ContainerBreakpoints<Name, Points> {
  return Object.fromEntries(
    Object.entries(points).map(([name, { minInlineSize }], index) => [
      name,
      axisPoint(
        `container.${container.name}`,
        name,
        `@container ${container.name} (min-width: ${minInlineSize.css})`,
        {
          kind: 'resizeContainer',
          container: container.name,
          minInlineSize: minInlineSize.css,
        },
        { order: index + 1, bound: 'above', container: container.name },
      ),
    ]),
  ) as ContainerBreakpoints<Name, Points>;
}

export type { AnyAxisPoint };
