/**
 * How much room is left before the layout tips over.
 *
 * > `userCard/title`: takes a second line at 34 characters.
 * > The current German string is 33. **Margin: 1.**
 *
 * This is the predictive half of the whole plan. Every other check answers "did
 * it break?", after the fact, once somebody has already shipped the string that
 * broke it. This one answers "will it break?" — and it fails in CI, with no
 * human and no pixel, on the translation that has not been written yet.
 *
 * A margin is only meaningful against a *measured* transition. A threshold
 * somebody wrote down by hand is a threshold that drifted the first time
 * anybody touched the CSS, and a budget checked against it reports comfort that
 * is not there.
 */
import type { Transition, TransitionSearch } from './transitions.js';

export interface Margin {
  readonly axis: string;
  /** The value in use today — the longest real translation, say. */
  readonly actual: number;
  /** The nearest transition above it, if there is one. */
  readonly transition?: Transition;
  /** `transition.at - actual`. Absent when nothing is above. */
  readonly headroom?: number;
  /** Headroom as a fraction of the transition. */
  readonly ratio?: number;
}

export interface MarginBudget {
  /** Minimum headroom, as a fraction of the transition. */
  readonly minimumRatio?: number;
  /** Minimum headroom in absolute units, whichever is stricter. */
  readonly minimumAbsolute?: number;
}

export const DEFAULT_MARGIN_BUDGET: Required<MarginBudget> = {
  minimumRatio: 0.15,
  minimumAbsolute: 1,
};

/**
 * The distance from today's content to the nearest transition above it.
 *
 * Only above. A transition below the current value has already been crossed;
 * reporting it as a margin would count a layout that is *already* wrapping as
 * comfortable.
 */
export function marginOf(search: TransitionSearch, actual: number): Margin {
  const above = search.transitions
    .filter((transition) => transition.at > actual)
    .sort((left, right) => left.at - right.at);
  const nearest = above[0];
  if (!nearest) return { axis: search.axis, actual };
  const headroom = nearest.at - actual;
  return {
    axis: search.axis,
    actual,
    transition: nearest,
    headroom,
    ratio: nearest.at === 0 ? 0 : headroom / nearest.at,
  };
}

export interface MarginViolation {
  readonly margin: Margin;
  readonly message: string;
}

export function checkMargins(
  margins: readonly Margin[],
  budget: MarginBudget = {},
): readonly MarginViolation[] {
  const minimumRatio = budget.minimumRatio ?? DEFAULT_MARGIN_BUDGET.minimumRatio;
  const minimumAbsolute =
    budget.minimumAbsolute ?? DEFAULT_MARGIN_BUDGET.minimumAbsolute;

  return margins.flatMap((margin) => {
    // No transition above: nothing in the searched range breaks it. Reported as
    // comfortable rather than as unknown, because the search bounds are the
    // caller's claim about what values are reachable.
    if (margin.headroom === undefined || margin.transition === undefined) return [];
    const tooTight =
      margin.headroom < minimumAbsolute ||
      (margin.ratio ?? 0) < minimumRatio;
    if (!tooTight) return [];
    return [
      {
        margin,
        message: `${margin.axis}: ${margin.transition.change} at ${margin.transition.at}; today's content is ${margin.actual}. Margin ${margin.headroom} (${((margin.ratio ?? 0) * 100).toFixed(0)}%), below ${(minimumRatio * 100).toFixed(0)}%.`,
      },
    ];
  });
}

/**
 * Fails on a margin that is about to be spent.
 *
 * It does not say "this broke". It says "this will break at the next
 * translation" — which is the only kind of report that arrives in time to be
 * cheap to act on.
 */
export function assertMargins(
  margins: readonly Margin[],
  budget: MarginBudget = {},
): void {
  const violations = checkMargins(margins, budget);
  if (violations.length === 0) return;
  throw new Error(
    [
      `assertMargins: ${violations.length} layout(s) have no room left.`,
      ...violations.map((violation) => `  ${violation.message}`),
      '  Nothing is broken yet. That is the point of the report.',
    ].join('\n'),
  );
}

export interface SearchCost {
  readonly axis: string;
  readonly samples: number;
  readonly milliseconds: number;
  /** Renders per transition found — the number that decides whether wave 3 opens. */
  readonly perTransition: number;
}

/**
 * What one bisection actually cost.
 *
 * Recorded because wave 3 multiplies this by the number of viewport breakpoints
 * and by the number of neighbourhoods; a search that is merely tolerable on one
 * isolated component is unaffordable there, and the decision has to rest on a
 * measurement rather than on a feeling.
 */
export const costOf = (
  search: TransitionSearch,
  milliseconds: number,
): SearchCost => ({
  axis: search.axis,
  samples: search.samples,
  milliseconds,
  perTransition:
    search.transitions.length === 0
      ? search.samples
      : search.samples / search.transitions.length,
});
