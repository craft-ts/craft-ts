/**
 * The axis vocabulary.
 *
 * Falsifiability, observed rather than staged: the write constraint was written
 * first with an **optional** marker on `VarWrite`, and all three rejections
 * below came back green — a plain declaration satisfies
 * `VarWrite<'<color>'>` structurally when the marker is optional. Making the
 * marker required turned them red. It is the same trap as an optional phantom
 * on a primitive base, one level up, and it is why these three lines are worth
 * having.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { kind } from '../kinds.ts';
import { cssVars, resetCssVarRegistry, set } from '../css-vars.ts';
import { p, display } from '../props/index.ts';
import { palette } from '../tokens/palette.ts';
import { space } from '../tokens/scales.ts';
import { unit } from '../tokens/units.ts';
import { craftStyles, resetStyleRegistry, when } from '../styles.ts';
import {
  above,
  at,
  below,
  defineAxis,
  defineBreakpoints,
  defineContainer,
  defineStateAxis,
  onlyVarsOfKind,
} from './define.ts';
import {
  STANDARD_AXES,
  contrast,
  descendant,
  forcedColors,
  motion,
  scheme,
  scrollState,
} from './standard.ts';

beforeEach(() => {
  resetStyleRegistry();
  resetCssVarRegistry();
});

describe('the standard axes are closed sets', () => {
  it('opens each one on the at-rule the platform defines', () => {
    expect(scheme.dark.open).toBe('@media (prefers-color-scheme: dark)');
    expect(motion.reduced.open).toBe('@media (prefers-reduced-motion: reduce)');
    expect(forcedColors.active.open).toBe('@media (forced-colors: active)');
    expect(contrast.more.open).toBe('@media (prefers-contrast: more)');
    expect(scrollState.stuck.blockEnd.open).toBe(
      '@container scroll-state(stuck: block-end)',
    );
  });

  it('makes a typo a missing property rather than ignored CSS', () => {
    const _rejected = () => {
      // @ts-expect-error the platform has no such scroll state
      void scrollState.stuck.blockEndd;
      // @ts-expect-error nor is a point something you pass in
      void scrollState.stuck('block-end');
      // @ts-expect-error `base` is the absence of a condition, not a point
      void scheme.light;
    };
    expect(_rejected).toBeTypeOf('function');
  });

  it('gives every standard point a driver', () => {
    // An axis without one enumerates scenarios nothing can reach and renders
    // identical captures — false coverage, which is worse than none.
    for (const point of STANDARD_AXES) {
      expect(point.driver).toBeDefined();
      expect(typeof point.driver.kind).toBe('string');
    }
  });

  it('keeps the three scroll-state groups apart', () => {
    // An element can be stuck and snapped at once. One axis with all the
    // points would tell the matrix those exclude each other.
    expect(scrollState.stuck.blockEnd.axis).toBe('scrollState.stuck');
    expect(scrollState.snapped.block.axis).toBe('scrollState.snapped');
    expect(scrollState.scrollable.blockEnd.axis).toBe('scrollState.scrollable');
    // Within a group, the points share an axis and are therefore exclusive.
    expect(
      new Set(Object.values(scrollState.stuck).map((point) => point.axis)).size,
    ).toBe(1);
  });

  it('routes every :has() through descendant.*', () => {
    expect(descendant.userInvalid.open).toBe('&:has(:user-invalid)');
    expect(descendant.focusVisible.driver).toEqual({
      kind: 'descendantState',
      state: 'focus-visible',
    });
    // Each entry is its own axis: "a descendant is invalid" and "a descendant
    // has focus" are independent, not alternatives.
    expect(descendant.userInvalid.axis).not.toBe(descendant.checked.axis);
  });
});

describe('breakpoints are ordered and indexed', () => {
  const bp = defineBreakpoints({
    sm: at.minInlineSize(unit.rem(30)),
    md: at.minInlineSize(unit.rem(48)),
    lg: at.minInlineSize(unit.rem(64)),
  });

  it('takes built conditions, never strings', () => {
    expect(bp.md.open).toBe('@media (min-width: 48rem)');
    expect(bp.md.driver).toEqual({ kind: 'resize', minInlineSize: '48rem' });

    const _rejected = () => {
      // @ts-expect-error a breakpoint is a built condition, not a media string
      defineBreakpoints({ md: '(min-width: 48rem)' });
    };
    expect(_rejected).toBeTypeOf('function');
  });

  it('numbers them by declaration order', () => {
    // The order is what lets the matrix reduce by interval and what makes a
    // dead rule recognisable. Nothing else can infer it.
    expect([bp.sm.order, bp.md.order, bp.lg.order]).toEqual([1, 2, 3]);
    expect(bp.md.bound).toBe('above');
  });

  it('negates the query for an upper bound', () => {
    expect(below(bp.md).open).toBe('@media not (min-width: 48rem)');
    expect(above(bp.md).bound).toBe('above');
  });

  it('refuses an interval no viewport can satisfy', () => {
    // At least lg and under sm at the same time: the rule inside would never
    // apply, and no test would ever catch it, because there is nothing to see.
    expect(() =>
      when(above(bp.lg), [when(below(bp.sm), [p(space(4))])]),
    ).toThrow(/no viewport satisfies/);
  });

  it('leaves a real interval alone', () => {
    expect(() =>
      when(above(bp.sm), [when(below(bp.lg), [p(space(4))])]),
    ).not.toThrow();
  });
});

describe('an axis can be constrained to what it may write', () => {
  it('accepts a variable write of the right kind', () => {
    const v = cssVars('themed', { ink: kind.color(palette.text.strong) });
    const theme = defineAxis('theme', ['dusk'], {
      writes: onlyVarsOfKind(kind.color).writes,
    });

    const sheet = craftStyles('themed', {
      root: [when(theme.dusk, [set(v.ink, palette.text.muted)])],
    });

    expect(sheet.root.split(' ')).toHaveLength(1);
  });

  it('refuses a property, and refuses a write of another kind', () => {
    const v = cssVars('themed', {
      ink: kind.color(palette.text.strong),
      pad: kind.length(unit.px(8)),
    });
    const theme = defineAxis('theme', ['dusk'], {
      writes: onlyVarsOfKind(kind.color).writes,
    });

    const _rejected = () => {
      // @ts-expect-error a colour-only axis cannot move a box
      when(theme.dusk, [p(space(6))]);
      // @ts-expect-error nor set a keyword property
      when(theme.dusk, [display.flex]);
      // @ts-expect-error nor write a variable of another kind
      when(theme.dusk, [set(v.pad, unit.px(16))]);
    };
    expect(_rejected).toBeTypeOf('function');
  });

  it('leaves an unconstrained axis unconstrained', () => {
    const tone = defineStateAxis('tone', ['danger']);

    expect(() => when(tone.danger, [p(space(4))])).not.toThrow();
    expect(tone.danger.open).toBe("&[data-tone='danger']");
    // The attribute-value form makes the states mutually exclusive by
    // construction: an element cannot be two of them at once.
    expect(tone.danger.driver).toEqual({
      kind: 'setAttribute',
      name: 'data-tone',
      value: 'danger',
    });
  });
});

describe('a container axis names the container it queries', () => {
  const card = defineContainer(
    { name: 'card', type: 'inline-size' },
    {
      wide: at.minInlineSize(unit.rem(24)),
    },
  );

  it('opens on a container query and carries its own driver', () => {
    expect(card.wide.open).toBe('@container card (min-width: 24rem)');
    expect(card.wide.driver).toEqual({
      kind: 'resizeContainer',
      container: 'card',
      minInlineSize: '24rem',
    });
  });

  it('records the container, so the matrix can stop the axis there', () => {
    // A container axis answers "how wide is my box", which nobody above the
    // container can change. Propagating it upwards would hand every ancestor
    // scenarios it has no way to affect.
    expect(card.wide.container).toBe('card');
    expect(card.wide.axis).toBe('container.card');
  });
});
