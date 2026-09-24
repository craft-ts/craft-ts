/**
 * Animations and transitions, as typed values.
 *
 * `keyframes(...)` hands back a **token**, not a name: `animate(spin, {...})`
 * cannot point at keyframes that do not exist, which is what a hand-written
 * `animation: spinn 1s` does without a word.
 *
 * None of this needs a `prefers-reduced-motion` branch of its own. The global
 * foundation neutralises every animation and transition under `motion.reduced`
 * once, for the whole document — see `global/base.ts`. A component that had
 * to remember it would be a component that forgets it.
 *
 * `animate` and `transitions` are not called `animation` and `transition`:
 * those names already belong to the generated shorthand helpers. Same
 * collision rule as `unit.px` and `kind.color`.
 */
import type { Declaration } from './props/factory.ts';
import { declaration } from './props/factory.ts';
import type { prop } from './props/generated.ts';
import type { TimeValue } from './tokens/units.ts';

declare const KEYFRAMES: unique symbol;
declare const EASING: unique symbol;

// ─── easing ─────────────────────────────────────────────────────────────────

export interface EasingValue {
  readonly css: string;
  readonly [EASING]: true;
}

const easingOf = (css: string): EasingValue => ({ css }) as EasingValue;

const unitInterval = (name: string, value: number): number => {
  if (!(value >= 0 && value <= 1)) {
    throw new Error(
      `easing.cubicBezier: '${name}' is ${value}, outside [0, 1]. The x coordinates of a cubic-bezier must stay in that interval or the browser rejects the whole declaration.`,
    );
  }
  return value;
};

export const easing = {
  linear: easingOf('linear'),
  ease: easingOf('ease'),
  easeIn: easingOf('ease-in'),
  easeOut: easingOf('ease-out'),
  easeInOut: easingOf('ease-in-out'),
  stepStart: easingOf('step-start'),
  stepEnd: easingOf('step-end'),
  cubicBezier: (x1: number, y1: number, x2: number, y2: number) =>
    easingOf(
      `cubic-bezier(${unitInterval('x1', x1)}, ${y1}, ${unitInterval('x2', x2)}, ${y2})`,
    ),
  steps: (count: number, position: 'start' | 'end' | 'both' | 'none' = 'end') =>
    easingOf(
      `steps(${Math.max(1, Math.trunc(count))}, ${position === 'both' || position === 'none' ? `jump-${position}` : position})`,
    ),
} as const;

// ─── keyframes ──────────────────────────────────────────────────────────────

export type KeyframeSelector = 'from' | 'to' | `${number}%`;

export type KeyframeSteps = Partial<
  Record<KeyframeSelector, readonly (Declaration | readonly Declaration[])[]>
>;

export interface KeyframesToken {
  /** The `@keyframes` name the emitter writes. */
  readonly name: string;
  readonly [KEYFRAMES]: true;
}

export interface RegisteredKeyframes {
  readonly name: string;
  readonly steps: readonly {
    readonly selector: string;
    readonly declarations: readonly Declaration[];
  }[];
}

const registeredFrames = new Map<string, RegisteredKeyframes>();

export const registeredKeyframes = (): readonly RegisteredKeyframes[] => [
  ...registeredFrames.values(),
];

/** Test-only: the registry is module state, and a spec must be able to reset it. */
export const resetKeyframesRegistry = (): void => registeredFrames.clear();

const PERCENT_STEP = /^(\d{1,2}(\.\d+)?|100)%$/;

/**
 * `@keyframes <prefix>`, emitted in the `craft.components` layer.
 *
 * The steps are declarations from the generated table, like a sheet — a
 * keyframe is not a place where raw CSS gets back in.
 */
export function keyframes(
  prefix: string,
  steps: KeyframeSteps,
): KeyframesToken {
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(prefix)) {
    throw new Error(
      `keyframes: '${prefix}' is not a valid name. Use letters, digits and dashes, starting with a letter.`,
    );
  }
  if (registeredFrames.has(prefix)) {
    throw new Error(
      `keyframes: '${prefix}' is already declared. Two animations sharing a name would replace each other in the cascade; pick a prefix per animation.`,
    );
  }
  const entries = Object.entries(steps) as [
    string,
    readonly (Declaration | readonly Declaration[])[],
  ][];
  if (entries.length === 0) {
    throw new Error(`keyframes: '${prefix}' declares no step.`);
  }
  for (const [selector] of entries) {
    if (
      selector !== 'from' &&
      selector !== 'to' &&
      !PERCENT_STEP.test(selector)
    ) {
      throw new Error(
        `keyframes: '${prefix}' has a step '${selector}', which is neither 'from', 'to' nor a percentage between 0% and 100%.`,
      );
    }
  }
  registeredFrames.set(prefix, {
    name: prefix,
    steps: entries.map(([selector, items]) => ({
      selector,
      declarations: items.flat() as readonly Declaration[],
    })),
  });
  return { name: prefix } as KeyframesToken;
}

// ─── animate ────────────────────────────────────────────────────────────────

export interface AnimateOptions {
  readonly duration: TimeValue;
  readonly easing?: EasingValue;
  readonly delay?: TimeValue;
  /** A count, or `'infinite'`. Defaults to 1. */
  readonly iterations?: number | 'infinite';
  readonly direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  readonly fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
}

/**
 * Plays keyframes. Longhands only, so a variant can override one of them —
 * the duration under `when(size.lg, ...)` — without restating the others.
 */
export function animate(
  token: KeyframesToken,
  options: AnimateOptions,
): readonly Declaration[] {
  const iterations = options.iterations ?? 1;
  if (iterations !== 'infinite' && !(iterations >= 0)) {
    throw new Error(
      `animate: '${token.name}' is asked to run ${iterations} times. Use a count of 0 or more, or 'infinite'.`,
    );
  }
  return [
    declaration('animation-name', token.name),
    declaration('animation-duration', options.duration.css),
    declaration(
      'animation-timing-function',
      (options.easing ?? easing.ease).css,
    ),
    declaration('animation-iteration-count', String(iterations)),
    ...(options.delay
      ? [declaration('animation-delay', options.delay.css)]
      : []),
    ...(options.direction
      ? [declaration('animation-direction', options.direction)]
      : []),
    ...(options.fillMode
      ? [declaration('animation-fill-mode', options.fillMode)]
      : []),
  ];
}

// ─── transitions ────────────────────────────────────────────────────────────

/** A property name from the generated table — `prop.backgroundColor`. */
export type TransitionableProperty = (typeof prop)[keyof typeof prop];

export interface TransitionOptions {
  readonly duration: TimeValue;
  readonly easing?: EasingValue;
  readonly delay?: TimeValue;
}

/**
 * Transitions the named properties.
 *
 * The properties are **named from the table** (`prop.color`), never `all`:
 * `transition: all` animates whatever a later variant happens to change,
 * including layout, and nobody decided that.
 */
export function transitions(
  properties: readonly [TransitionableProperty, ...TransitionableProperty[]],
  options: TransitionOptions,
): readonly Declaration[] {
  return [
    declaration('transition-property', properties.join(', ')),
    declaration('transition-duration', options.duration.css),
    declaration(
      'transition-timing-function',
      (options.easing ?? easing.ease).css,
    ),
    ...(options.delay
      ? [declaration('transition-delay', options.delay.css)]
      : []),
  ];
}
