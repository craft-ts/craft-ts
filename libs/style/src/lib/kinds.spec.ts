/**
 * What the kind lattice guarantees.
 *
 * Falsifiability check for this file (run it by hand when the lattice changes):
 * make `Assignable` symmetric —
 *   `[ValueOf<From>] extends [ValueOf<To>] ? true : [ValueOf<To>] extends [ValueOf<From>] ? true : false`
 * — and the four "not the other way round" assertions below go red. They were
 * confirmed red before this file was committed.
 */
import { describe, expect, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import { csv, kind, many, oneOf, type Assignable } from './kinds.ts';
import { palette } from './tokens/palette.ts';
import { space } from './tokens/scales.ts';
import { unit } from './tokens/units.ts';

describe('the syntax strings are the ones @property registers', () => {
  it('spells each kind exactly as CSS does', () => {
    expect(kind.color.syntax).toBe('<color>');
    expect(kind.length.syntax).toBe('<length>');
    expect(kind.lengthPercentage.syntax).toBe('<length-percentage>');
    expect(kind.integer.syntax).toBe('<integer>');
    expect(many(kind.length).syntax).toBe('<length>+');
    expect(csv(kind.color).syntax).toBe('<color>#');
    expect(oneOf('auto', 'none').syntax).toBe('auto | none');
  });

  it('builds a spec that carries the initial value and the defaults', () => {
    const spec = kind.color(palette.accent.danger);

    expect(spec.syntax).toBe('<color>');
    expect(spec.initial.css).toBe('#a11b1b');
    // `inherits: false` bounds invalidation when the variable is rewritten at
    // runtime, instead of recomputing the whole subtree.
    expect(spec.inherits).toBe(false);
    // The role rides along from the token: an axis constrained to colours can
    // then be checked against it rather than against a property name.
    expect(spec.role).toBe('accent');
  });

  it('takes the caller option over the default when asked', () => {
    const spec = kind.length(space(4), { inherits: true, role: 'border' });

    expect(spec.inherits).toBe(true);
    expect(spec.role).toBe('border');
  });
});

describe('the lattice flows the way CSS does, and not the other way round', () => {
  it('widens a length into a length-percentage, never the reverse', () => {
    type _widening = Expect<
      Equal<Assignable<typeof kind.length, typeof kind.lengthPercentage>, true>
    >;
    type _narrowing = Expect<
      Equal<Assignable<typeof kind.lengthPercentage, typeof kind.length>, false>
    >;

    expect(unit.rem(1).css).toBe('1rem');
  });

  it('widens an integer into a number, never the reverse', () => {
    type _widening = Expect<
      Equal<Assignable<typeof kind.integer, typeof kind.number>, true>
    >;
    type _narrowing = Expect<
      Equal<Assignable<typeof kind.number, typeof kind.integer>, false>
    >;

    expect(kind.integer.syntax).toBe('<integer>');
  });

  it('keeps unrelated kinds apart in both directions', () => {
    type _colorIntoLength = Expect<
      Equal<Assignable<typeof kind.color, typeof kind.length>, false>
    >;
    type _lengthIntoColor = Expect<
      Equal<Assignable<typeof kind.length, typeof kind.color>, false>
    >;

    expect(kind.color.syntax).not.toBe(kind.length.syntax);
  });
});
