import { describe, expect, it } from 'vitest';

// #region imports
import {
  at,
  axisPoint,
  craftStyles,
  cssVars,
  darkOf,
  defineAxis,
  defineBreakpoints,
  defineContainer,
  definePalette,
  defineStateAxis,
  kind,
  onlyVarsOfKind,
  scheme,
  seal,
  set,
  space,
  unit,
  when,
} from '@craft-ts/style';
// #endregion imports

// #region palette
export const palette = definePalette({
  surface: {
    page: { light: '#fbfbfd', dark: '#0b0d11' },
    raised: { light: '#ffffff', dark: '#151922' },
  },
  text: {
    strong: { light: '#111318', dark: '#f2f4f8' },
    muted: { light: '#5b6472', dark: '#98a2b3' },
  },
  accent: {
    neutral: { light: '#4a5568', dark: '#a6b0c0' },
    danger: { light: '#a11b1b', dark: '#ff6b6b' },
  },
});
// #endregion palette

// #region breakpoints
export const bp = defineBreakpoints({
  sm: at.minInlineSize(unit.rem(30)),
  md: at.minInlineSize(unit.rem(48)),
  lg: at.minInlineSize(unit.rem(64)),
});
// #endregion breakpoints

// #region state-axis
/** Drives `data-tone` on the element that carries it. */
export const tone = defineStateAxis('tone', [
  'neutral',
  'danger',
] as const);

/** Drives `data-size`. */
export const size = defineStateAxis('size', ['sm', 'md', 'lg'] as const);
// #endregion state-axis

// #region constrained-axis
// This axis may only ever write colours. A `<color>`-only axis cannot move a
// box, so it crosses additively with the axes that do — and the constraint is
// checked at the `when` call site, not by reading the emitted CSS afterwards.
export const brand = defineAxis('brand', ['acme', 'globex'] as const, {
  ...onlyVarsOfKind(kind.color),
});
// #endregion constrained-axis

// #region container
// Closed at the element that declares the container: nobody above it can change
// how wide the box is, so the axis must not travel past it.
export const card = defineContainer(
  { name: 'card', type: 'inline-size' },
  { narrow: at.minInlineSize(unit.rem(20)), wide: at.minInlineSize(unit.rem(40)) },
);
// #endregion container

// #region theme
// `inherits: true` belongs to theme variables and to nothing else: they are set
// once on a wrapper and read by everything below. The default, `false`, bounds
// invalidation to the element that both sets and reads the variable.
const themed = { inherits: true } as const;

export const theme = cssVars('ds', {
  surface: kind.color(palette.surface.page, themed),
  ink: kind.color(palette.text.strong, themed),
  inkMuted: kind.color(palette.text.muted, themed),
  accent: kind.color(palette.accent.neutral, themed),
  // Absolute, because `@property` requires a computationally independent
  // initial value: `1rem` makes the browser drop the registration, silently.
  gutter: kind.length(unit.px(16), themed),
});

export const dsTheme = craftStyles('dsTheme', {
  root: [
    set(theme.surface, palette.surface.page),
    set(theme.ink, palette.text.strong),
    set(theme.gutter, space(4)),
    when(bp.md, [set(theme.gutter, space(6))]),
    // Dark mode is one rule, here — not one rule per component.
    when(scheme.dark, [
      set(theme.surface, darkOf(palette.surface.page)),
      set(theme.ink, darkOf(palette.text.strong)),
    ]),
  ],
});
// #endregion theme

describe('guide/style/define.md', () => {
  it('gives every axis point a driver a test can reach', () => {
    expect(tone.danger.open).toContain("data-tone='danger'");
    expect(size.sm.driver).toEqual({
      kind: 'setAttribute',
      name: 'data-size',
      value: 'sm',
    });
  });

  it('carries both sides of every palette token', () => {
    expect(darkOf(palette.text.strong).css).toBe('#f2f4f8');
  });

  it('closes a container axis on its own container', () => {
    expect(card.wide.open).toContain('@container card');
  });

  it('re-exports the escape hatch used to hand-write a point', () => {
    expect(typeof axisPoint).toBe('function');
    expect(typeof seal).toBe('function');
    expect(typeof brand.acme).toBe('object');
  });
});
