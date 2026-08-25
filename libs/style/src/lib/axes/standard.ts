/**
 * The axes the platform defines, shipped closed.
 *
 * Property access only — `scrollState.stuck.blockEnd`, never
 * `scrollState.stuck('block-end')`. A typo is
 * `Property 'blockEndd' does not exist`, and not a container query the browser
 * parses, ignores, and never mentions again.
 *
 * `descendant.*` is the **only** door to `:has()`. Free-form `:has()` reaches
 * across a component boundary, so a component's visual states would depend on
 * markup it does not own — which is exactly the thing the matrix cannot model.
 * The combinators that stay inside a component (`+`, `~`, `:nth-child`) are not
 * restricted; `no-free-has` enforces the rest.
 */
import { axisPoint, type AxisPoint, type Driver } from './types.ts';

const media = (
  axis: string,
  name: string,
  feature: Extract<Driver, { kind: 'emulateMedia' }>['feature'],
  value: string,
) =>
  axisPoint(axis, name, `@media (${feature}: ${value})`, {
    kind: 'emulateMedia',
    feature,
    value,
  });

/**
 * The user's preferred colour scheme.
 *
 * Named `scheme` and not `colorScheme`, which the generated table already uses
 * for the `color-scheme` **property** — a different thing: the property tells
 * the UA which schemes the page supports, the axis asks which one the user
 * wants. Fourth collision settled the same way as `px`, `color` and
 * `minInlineSize`; here the shorter distinct name reads better than a namespace.
 *
 * `base` is implicit on every axis: it is the absence of a condition. There is
 * therefore no `scheme.light` — writing light styles unconditionally and
 * overriding them in dark is the one spelling.
 */
export const scheme = {
  dark: media('scheme', 'dark', 'prefers-color-scheme', 'dark') as AxisPoint<
    'scheme',
    'dark'
  >,
} as const;

export const motion = {
  reduced: media(
    'motion',
    'reduced',
    'prefers-reduced-motion',
    'reduce',
  ) as AxisPoint<'motion', 'reduced'>,
} as const;

export const forcedColors = {
  active: media(
    'forcedColors',
    'active',
    'forced-colors',
    'active',
  ) as AxisPoint<'forcedColors', 'active'>,
} as const;

export const contrast = {
  more: media('contrast', 'more', 'prefers-contrast', 'more') as AxisPoint<
    'contrast',
    'more'
  >,
} as const;

// ─── scroll state ───────────────────────────────────────────────────────────
// `@container scroll-state(...)`. Reading it requires a
// `container-type: scroll-state` ancestor, which only `provides(containerType.scrollState)`
// can lay down — so a sheet cannot query a state nobody made queryable.

const scrollStatePoint = (
  group: 'stuck' | 'snapped' | 'scrollable',
  name: string,
  value: string,
  to: 'start' | 'end' | 'snap',
) =>
  axisPoint(
    `scrollState.${group}`,
    name,
    `@container scroll-state(${group}: ${value})`,
    { kind: 'scroll', to },
  );

/**
 * The three groups are separate axes, not one.
 *
 * An element can be stuck *and* snapped at the same time, so folding them into
 * a single axis would make the matrix claim combinations are impossible when
 * they are not. Within one group the points are mutually exclusive, which is
 * what the reduction in wave 5 would rely on.
 */
export const scrollState = {
  stuck: {
    none: scrollStatePoint('stuck', 'none', 'none', 'start'),
    blockStart: scrollStatePoint('stuck', 'blockStart', 'block-start', 'start'),
    blockEnd: scrollStatePoint('stuck', 'blockEnd', 'block-end', 'end'),
    inlineStart: scrollStatePoint(
      'stuck',
      'inlineStart',
      'inline-start',
      'start',
    ),
    inlineEnd: scrollStatePoint('stuck', 'inlineEnd', 'inline-end', 'end'),
  },
  snapped: {
    none: scrollStatePoint('snapped', 'none', 'none', 'start'),
    block: scrollStatePoint('snapped', 'block', 'block', 'snap'),
    inline: scrollStatePoint('snapped', 'inline', 'inline', 'snap'),
    both: scrollStatePoint('snapped', 'both', 'both', 'snap'),
  },
  scrollable: {
    none: scrollStatePoint('scrollable', 'none', 'none', 'start'),
    blockStart: scrollStatePoint(
      'scrollable',
      'blockStart',
      'block-start',
      'end',
    ),
    blockEnd: scrollStatePoint('scrollable', 'blockEnd', 'block-end', 'start'),
    inlineStart: scrollStatePoint(
      'scrollable',
      'inlineStart',
      'inline-start',
      'end',
    ),
    inlineEnd: scrollStatePoint(
      'scrollable',
      'inlineEnd',
      'inline-end',
      'start',
    ),
  },
} as const;

// ─── descendant state ───────────────────────────────────────────────────────

const descendantPoint = (
  name: string,
  selector: string,
  state: Extract<Driver, { kind: 'descendantState' }>['state'],
) =>
  axisPoint(`descendant.${name}`, 'present', `&:has(${selector})`, {
    kind: 'descendantState',
    state,
  });

/**
 * The only entry point to `:has()`.
 *
 * Each entry is its own axis with a single point, because "a descendant is
 * invalid" and "a descendant has focus" are independent — one axis with three
 * points would say they exclude each other.
 */
export const descendant = {
  userInvalid: descendantPoint('userInvalid', ':user-invalid', 'user-invalid'),
  focusVisible: descendantPoint(
    'focusVisible',
    ':focus-visible',
    'focus-visible',
  ),
  checked: descendantPoint('checked', ':checked', 'checked'),
} as const;

/** Every standard point, for the specs that assert each one has a driver. */
export const STANDARD_AXES = [
  ...Object.values(scheme),
  ...Object.values(motion),
  ...Object.values(forcedColors),
  ...Object.values(contrast),
  ...Object.values(scrollState.stuck),
  ...Object.values(scrollState.snapped),
  ...Object.values(scrollState.scrollable),
  ...Object.values(descendant),
] as const;
