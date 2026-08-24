/**
 * The emitter.
 *
 * Falsifiability check (run by hand when the validation changes): make
 * `validateAtoms` a no-op and "fails the build on a property the vocabulary
 * does not own" goes green. Confirmed red before this file was committed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { at, defineBreakpoints, defineStateAxis, scheme } from '../lib/axes';
import {
  craftStyles,
  registeredAtoms,
  resetStyleRegistry,
  when,
} from '../lib/styles';
import { cssVars, resetCssVarRegistry } from '../lib/css-vars';
import { kind } from '../lib/kinds';
import { provides, scrollPort } from '../lib/obligations';
import { bg, display, p, px } from '../lib/props';
import { palette } from '../lib/tokens/palette';
import { space } from '../lib/tokens/scales';
import { unit } from '../lib/tokens/units';
import {
  LAYERS,
  UnknownCssError,
  knownProperties,
  renderCss,
  styleDump,
  validateAtoms,
} from './emit';

const bp = defineBreakpoints({ md: at.minInlineSize(unit.rem(64)) });
const tone = defineStateAxis('tone', ['danger']);

beforeEach(() => {
  resetStyleRegistry();
  resetCssVarRegistry();
});

describe('deduplication happens once, at the rule', () => {
  it('emits a single declaration for two components writing it', () => {
    craftStyles('left', { root: [p(space(4))] });
    craftStyles('right', { root: [p(space(4))] });

    const css = renderCss(registeredAtoms(), []);
    expect(css.match(/padding:1rem/g)).toHaveLength(1);
  });
});

describe('the layers are ordered by the emitter, not by import order', () => {
  it('declares the order first, and puts variants after components', () => {
    craftStyles('card', {
      root: [display.block, when(bp.md, [px(space(6))])],
    });

    const css = renderCss(registeredAtoms(), []);
    expect(css.startsWith(`@layer ${LAYERS.join(', ')};`)).toBe(true);
    expect(css.indexOf('@layer components')).toBeLessThan(
      css.indexOf('@layer variants'),
    );
  });

  it('wraps an at-rule around the rule and joins a selector to it', () => {
    craftStyles('card', {
      root: [
        when(bp.md, [px(space(6))]),
        when(tone.danger, [bg(palette.accent.danger)]),
        when(scheme.dark, [when(bp.md, [display.flex])]),
      ],
    });

    const css = renderCss(registeredAtoms(), []);
    expect(css).toContain('@media (min-width: 64rem){');
    expect(css).toMatch(/\[data-tone='danger'\]\{background-color:#a11b1b\}/);
    // Nested conditions nest: two at-rules, innermost last.
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\)\{@media \(min-width: 64rem\)\{[^}]*display:flex/,
    );
  });

  it('puts the @property blocks in the tokens layer', () => {
    const v = cssVars('card', { ink: kind.color(palette.text.strong) });
    const css = renderCss([], [v.ink.declaration]);

    expect(css).toContain('@layer tokens{@property --card-ink');
  });
});

describe('the output is deterministic', () => {
  it('does not depend on the order the sheets were registered in', () => {
    craftStyles('a', { root: [p(space(4)), display.flex] });
    craftStyles('b', { root: [bg(palette.surface.page)] });
    const first = renderCss([...registeredAtoms()].reverse(), []);
    const second = renderCss(registeredAtoms(), []);

    expect(first).toBe(second);
  });
});

describe('the last net under the escape hatches', () => {
  it('knows the generated table and the obligation-only properties', () => {
    const known = knownProperties();

    expect(known.has('padding')).toBe(true);
    // Only an obligation can write it, but the emitter must still accept it.
    expect(known.has('overflow-block')).toBe(true);
    expect(known.has('container-type')).toBe(true);
    expect(known.has('nonsense-property')).toBe(false);
  });

  it('lets a discharge write the overflow it owns', () => {
    craftStyles('shell', { main: [provides(scrollPort.block)] });

    expect(() =>
      validateAtoms(registeredAtoms(), 'shell.style.ts'),
    ).not.toThrow();
  });

  it('fails the build on a property the vocabulary does not own', () => {
    const smuggled = [
      {
        className: 'x',
        conditions: [],
        property: 'sparkle',
        value: 'on',
        unproven: '',
      },
    ];

    expect(() => validateAtoms(smuggled, 'demo/card.style.ts')).toThrow(
      UnknownCssError,
    );
    // The message names the file, because a build failure without a location
    // is a build failure nobody can act on.
    expect(() => validateAtoms(smuggled, 'demo/card.style.ts')).toThrow(
      /demo\/card\.style\.ts/,
    );
  });
});

describe('the dump the graph consumes', () => {
  it('carries the sheet key, its atoms, its axes and its obligations', () => {
    const v = cssVars('shell', { pad: kind.length(space(4)) });
    craftStyles('shell', {
      main: [provides(scrollPort.block), when(bp.md, [p(v.pad)])],
    });

    const dump = styleDump(
      [
        {
          key: 'shell-main',
          className: 'x y',
          rules: [],
          axes: { viewport: ['md'] },
          unproven: [],
          requires: [],
          provides: ['scrollPort.block'],
          violates: [],
        },
      ],
      registeredAtoms(),
      [v.pad.declaration],
    );

    expect(dump.classes[0].provides).toEqual(['scrollPort.block']);
    expect(
      dump.atoms.some((atom) => atom.conditions.includes('viewport:md')),
    ).toBe(true);
    expect(dump.vars[0].name).toBe('--shell-pad');
  });
});
