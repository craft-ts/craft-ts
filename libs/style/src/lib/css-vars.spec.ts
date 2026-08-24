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
import { bg, color, p } from './props';

beforeEach(resetCssVarRegistry);

describe('a variable declares itself the way @property does', () => {
  it('emits syntax, inherits and initial-value', () => {
    const v = cssVars('card', {
      ink: kind.color(palette.text.strong),
      pad: kind.length(space(4)),
    });

    expect(propertyRule(v.ink.declaration)).toBe(
      '@property --card-ink { syntax: "<color>"; inherits: false; initial-value: #111318; }',
    );
    expect(propertyRule(v.pad.declaration)).toContain('syntax: "<length>"');
  });

  it('derives the name instead of retyping it', () => {
    const v = cssVars('card', { ink: kind.color(palette.text.strong) });

    expect(v.ink.declaration.name).toBe('--card-ink');
    expect(color(v.ink).value).toBe('var(--card-ink)');
  });

  it('carries the kind, so a token is usable where its values are', () => {
    const v = cssVars('card', {
      ink: kind.color(palette.text.strong),
      pad: kind.length(space(4)),
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
