/**
 * Sheets, atoms, and the inferred variant contract.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import { at, defineBreakpoints, defineStateAxis, scheme } from './axes';
import { provides, requires, scrollPort } from './obligations';
import { bg, display, p, px } from './props';
import { palette } from './tokens/palette';
import { space } from './tokens/scales';
import { unit } from './tokens/units';
import {
  classKeyOf,
  craftStyles,
  registeredAtoms,
  registeredClasses,
  resetStyleRegistry,
  scenarios,
  when,
  type VariantsOf,
} from './styles';

const bp = defineBreakpoints({
  sm: at.minInlineSize(unit.rem(40)),
  md: at.minInlineSize(unit.rem(64)),
});
const tone = defineStateAxis('tone', ['success', 'danger']);

beforeEach(resetStyleRegistry);

describe('a sheet without a condition has an empty contract', () => {
  it('produces no axis at all', () => {
    const sheet = craftStyles('plain', { root: [display.block, p(space(4))] });

    type Contract = VariantsOf<typeof sheet.root>;
    type _empty = Expect<Equal<Contract, Record<never, never>>>;

    expect(scenarios('plain-root')).toHaveLength(1);
    expect(scenarios('plain-root')[0].id).toBe('base');
  });
});

describe('the contract keeps only the points actually used', () => {
  it('ignores the breakpoints the sheet never crosses', () => {
    const sheet = craftStyles('card', {
      root: [
        p(space(4)),
        when(bp.md, [px(space(6))]),
        when(scheme.dark, [bg(palette.surface.raised)]),
      ],
    });

    type Contract = VariantsOf<typeof sheet.root>;
    // `bp` defines sm AND md; the sheet crosses md only. Unfolding every point
    // of the axis would double the number of captures for scenarios nobody
    // ever renders.
    type _viewport = Expect<Equal<Contract['viewport'], 'md'>>;
    type _scheme = Expect<Equal<Contract['scheme'], 'dark'>>;

    // 2 schemes × 2 viewports, `base` included.
    expect(scenarios('card-root')).toHaveLength(4);
  });

  it('conjoins by nesting, and nesting only', () => {
    craftStyles('nested', {
      root: [when(scheme.dark, [when(bp.md, [p(space(6))])])],
    });

    const [atom] = registeredAtoms().filter(
      (rule) => rule.property === 'padding',
    );
    expect(atom.conditions.map((point) => point.point)).toEqual(['dark', 'md']);
  });
});

describe('the emitted classes are atomic', () => {
  it('gives two sheets writing the same rule the same atom', () => {
    const left = craftStyles('left', { root: [p(space(4))] });
    const right = craftStyles('right', { root: [p(space(4)), display.flex] });

    expect(left.root).toBe(right.root.split(' ')[0]);
    // Deduplication is at the rule, so the sheet grows with the vocabulary
    // rather than with the number of components.
    expect(registeredAtoms()).toHaveLength(2);
  });

  it('separates the same rule under different conditions', () => {
    craftStyles('scoped', { root: [p(space(4)), when(bp.md, [p(space(4))])] });

    expect(registeredAtoms()).toHaveLength(2);
  });

  it('names an atom readably, and uniquely', () => {
    const sheet = craftStyles('named', { root: [p(space(4))] });

    expect(sheet.root).toMatch(/^padding-1rem-[a-z0-9]{6}$/);
    // The name is a pure function of the rule, which is what makes the Node
    // evaluation and the browser runtime agree without sharing anything.
    expect(classKeyOf(sheet.root)).toBe('named-root');
  });

  it('refuses two sheets sharing a prefix', () => {
    craftStyles('twice', { root: [display.block] });

    expect(() => craftStyles('twice', { root: [display.flex] })).toThrow(
      /already declared/,
    );
  });
});

describe('inside a class, the last declaration is the one that applies', () => {
  it('drops the earlier atom for the same property instead of keeping both', () => {
    const sheet = craftStyles('typo', {
      badge: [p(space(2)), p(space(4))],
    });

    // Keeping both would leave the winner to stylesheet order — alphabetical
    // here — so a sheet's own cascade would depend on how the emitter sorted.
    expect(sheet.badge.split(' ')).toHaveLength(1);
    expect(sheet.badge).toContain('1rem');
  });

  it('keeps the same property under a different condition', () => {
    const sheet = craftStyles('scoped', {
      badge: [p(space(2)), when(bp.md, [p(space(4))])],
    });

    expect(sheet.badge.split(' ')).toHaveLength(2);
  });
});

describe('an obligation rides the sheet', () => {
  it('records what a class requires without emitting anything for it', () => {
    craftStyles('sticky', {
      button: [requires(scrollPort.block), p(space(2))],
    });

    const [registered] = registeredClasses();
    expect(registered.requires).toEqual(['scrollPort.block']);
    expect(registeredAtoms()).toHaveLength(1);
  });

  it('emits the CSS effect together with the discharge', () => {
    craftStyles('shell', { main: [provides(scrollPort.block)] });

    const [registered] = registeredClasses();
    expect(registered.provides).toEqual(['scrollPort.block']);
    // The coupling is the point: `min-block-size: 0` without `overflow-block`
    // does nothing, and the reverse produces a port that never shrinks.
    expect(registeredAtoms().map((atom) => atom.property)).toEqual([
      'overflow-block',
      'min-block-size',
    ]);
  });
});

describe('an axis carries its state through to the DOM', () => {
  it('opens on the attribute a driver can set', () => {
    craftStyles('toned', {
      root: [when(tone.danger, [bg(palette.accent.danger)])],
    });

    const [atom] = registeredAtoms();
    expect(atom.conditions[0].open).toBe("&[data-tone='danger']");
    expect(atom.conditions[0].driver).toEqual({
      kind: 'setAttribute',
      name: 'data-tone',
      value: 'danger',
    });
  });
});
