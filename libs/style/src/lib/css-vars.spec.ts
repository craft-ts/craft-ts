/**
 * Typed custom properties.
 *
 * Falsifiability check (run by hand when `.or` changes): widen its parameter to
 * `unknown` and the "the fallback is typed against the same kind" rejection
 * goes green. Confirmed red before this file was committed, then put back.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { assign, cssVars, propertyRule, resetCssVarRegistry } from './css-vars';
import { kind } from './kinds';
import { palette } from './tokens/palette';
import { space } from './tokens/scales';
import { unit } from './tokens/units';
import { bg, color, p } from './props';

beforeEach(resetCssVarRegistry);

describe('a variable declares itself the way @property does', () => {
  it('emits syntax, inherits and initial-value', () => {
    const v = cssVars('card', {
      ink: kind.color(palette.text.strong),
      pad: kind.length(unit.px(16)),
    });

    expect(propertyRule(v.ink.declaration)).toBe(
      '@property --card-ink { syntax: "<color>"; inherits: false; initial-value: #111318; }',
    );
    expect(propertyRule(v.pad.declaration)).toContain('syntax: "<length>"');
    expect(propertyRule(v.pad.declaration)).toContain('initial-value: 16px');
  });

  it('derives the name instead of retyping it', () => {
    const v = cssVars('card', { ink: kind.color(palette.text.strong) });

    expect(v.ink.declaration.name).toBe('--card-ink');
    expect(color(v.ink).value).toBe('var(--card-ink)');
  });

  it('carries the kind, so a token is usable where its values are', () => {
    const v = cssVars('card', {
      ink: kind.color(palette.text.strong),
      pad: kind.length(unit.px(16)),
    });

    color(v.ink);
    bg(v.ink);
    p(v.pad);

    // @ts-expect-error a <color> variable is not a length
    p(v.ink);
    // @ts-expect-error and a <length> variable is not a colour
    bg(v.pad);

    expect(v.ink.declaration.role).toBe('text');
  });

  it('types the fallback against the same kind', () => {
    const v = cssVars('card', { ink: kind.color(palette.text.strong) });

    expect(color(v.ink.or(palette.text.muted)).value).toBe(
      'var(--card-ink, #5b6472)',
    );

    // @ts-expect-error the fallback is typed against the same kind
    v.ink.or(space(4));
  });
});

describe('a registered initial value must be computationally independent', () => {
  it('refuses a relative unit instead of letting the browser drop the rule', () => {
    // `@property` rejects `initial-value: 1rem` and drops the *whole*
    // registration without a word. The variable then resolves to nothing
    // wherever it is read, and the declaration computes to zero — with every
    // test still green. Found on the design-system demo, where the colours were
    // registered and the lengths were not.
    expect(() => cssVars('bad', { pad: kind.length(space(4)) })).toThrow(
      /computationally independent/,
    );
    // The message has to say what to do instead, not only what is wrong.
    expect(() => cssVars('bad2', { pad: kind.length(unit.rem(1)) })).toThrow(
      /unit\.px/,
    );
  });

  it('leaves colours and percentages alone', () => {
    expect(() =>
      cssVars('fine', {
        ink: kind.color(palette.text.strong),
        ratio: kind.percentage(unit.pct(0)),
        pad: kind.length(unit.px(8)),
      }),
    ).not.toThrow();
  });
});

describe('two sheets cannot share a prefix', () => {
  it('refuses the second one instead of merging', () => {
    cssVars('card', { ink: kind.color(palette.text.strong) });

    // Merging would let one component's --card-ink be redefined by another's,
    // which is exactly the class of bug this package exists to remove.
    expect(() =>
      cssVars('card', { bg: kind.color(palette.surface.page) }),
    ).toThrow(/already declared/);
  });
});

describe('assign is the only gateway to the dynamic side', () => {
  it('produces an inline style the existing renderer already understands', () => {
    const v = cssVars('card', { ink: kind.color(palette.text.strong) });

    expect(assign(v.ink, palette.accent.danger)).toEqual({
      '--card-ink': '#a11b1b',
    });

    // @ts-expect-error a length cannot be written into a <color> variable
    assign(v.ink, space(4));
  });
});
