/**
 * What an axis is made of.
 *
 * An axis is a **closed** set of points, shipped by the library or built by
 * `defineBreakpoints` / `defineAxis` / `defineStateAxis` / `defineContainer`.
 * Never a string: `scrollState.stuck.blockEnd`, not
 * `scrollState.stuck('block-end')`. A key that does not exist is a compile
 * error, not CSS the browser ignores.
 *
 * Every point carries its **driver**. An axis without one would be worse than a
 * missing axis: the matrix would enumerate scenarios nothing can reach and
 * render identical captures, which is false coverage rather than no coverage.
 */

/** How a test reaches a point. There is no `'none'`: every point is reachable. */
export type Driver =
  | {
      readonly kind: 'emulateMedia';
      readonly feature:
        | 'prefers-color-scheme'
        | 'prefers-reduced-motion'
        | 'forced-colors'
        | 'prefers-contrast';
      readonly value: string;
    }
  | { readonly kind: 'resize'; readonly minInlineSize: string }
  | {
      readonly kind: 'resizeContainer';
      readonly container: string;
      readonly minInlineSize: string;
    }
  | {
      readonly kind: 'setAttribute';
      readonly name: string;
      readonly value: string;
    }
  | { readonly kind: 'scroll'; readonly to: 'start' | 'end' | 'snap' }
  | {
      readonly kind: 'descendantState';
      readonly state: 'user-invalid' | 'focus-visible' | 'checked';
    };

export interface AxisPoint<Axis extends string, Point extends string> {
  readonly axis: Axis;
  readonly point: Point;
  /** The at-rule or selector fragment the emitter wraps around the rule. */
  readonly open: string;
  readonly driver: Driver;
  /**
   * Ordered axes only — viewport and container. Two points of the same axis
   * with an order can be compared, which is what makes a dead rule detectable
   * and what lets the matrix reduce by interval instead of by product.
   */
  readonly order?: number;
  /**
   * Set when the point is a lower bound (`above`) or an upper bound (`below`).
   * A plain breakpoint is a lower bound.
   */
  readonly bound?: 'above' | 'below';
  /**
   * The container this point queries, when it is not the viewport. A container
   * axis does not propagate above the element that resolves it.
   */
  readonly container?: string;
  /**
   * Custom properties this axis is allowed to write, by kind syntax. Empty
   * means unconstrained. See `defineAxis(..., { writes })`.
   */
  readonly writes?: readonly string[];
}

export type AnyAxisPoint = AxisPoint<string, string>;

export const axisPoint = <Axis extends string, Point extends string>(
  axis: Axis,
  name: Point,
  open: string,
  driver: Driver,
  extra: Omit<Partial<AnyAxisPoint>, 'axis' | 'point' | 'open' | 'driver'> = {},
): AxisPoint<Axis, Point> => ({
  axis,
  point: name,
  open,
  driver,
  ...extra,
});
