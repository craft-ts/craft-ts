/**
 * The brand test — the most important spec in the package.
 *
 * Every `@ts-expect-error` below is an assertion that a string is **not** a
 * length. Written after the fact, such a test can pass while measuring nothing,
 * so it was falsified on purpose before being committed: replacing
 * `LengthValue` with `string & { __length?: true }` in `units.ts` turned all
 * five rejections green — proving the assertions really do measure the brand
 * and not something incidental. It was then put back.
 *
 * That failure mode is why the brand is a nominal object: with an optional
 * phantom on a primitive base, `'blabla'` stays assignable, every test stays
 * green, and every guarantee written in the docs is false.
 */
import { describe, expect, it } from 'vitest';
import { darkOf, definePalette, palette } from './palette';
import { lineWidth, radii, space, text, type SpaceStep } from './scales';
import { ident, int, num, unit, unsafeLength, type LengthValue } from './units';

const takesLength = (value: LengthValue): string => value.css;

describe('nothing that is not a design-system value is a value', () => {
  it('refuses strings wherever a length is expected', () => {
    takesLength(space(4));
    takesLength(unit.rem(1.5));
    takesLength(radii.md);

    // @ts-expect-error a length is not a string
    takesLength('12px');
    // @ts-expect-error not even a string of the right shape
    takesLength(`${4}px`);
    // @ts-expect-error nor an empty one
    takesLength('');
    // @ts-expect-error nor one produced at runtime
    takesLength(String(4) + 'px');
    // @ts-expect-error a colour is not a length
    takesLength(palette.text.strong);

    expect(space(4).css).toBe('1rem');
  });

  it('closes the scales', () => {
    // @ts-expect-error 7 is not a step; when a step is missing it is added to
    // the scale, because there is no arbitrary-value syntax on purpose.
    space(7);
    // @ts-expect-error and neither is a negative one
    space(-1);

    const steps: SpaceStep[] = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
    expect(steps.map((step) => space(step).css)).toContain('1rem');
    expect(lineWidth.hairline.css).toBe('1px');
  });

  it('keeps a font size a length, and keeps its line height with it', () => {
    takesLength(text.sm);
    expect(text.sm.lineHeight).toBe('1.25rem');
  });
});

describe('a palette token carries both values and its role', () => {
  it('derives the role from the group rather than repeating it', () => {
    expect(palette.surface.raised.role).toBe('surface');
    expect(palette.accent.danger.role).toBe('accent');
    expect(palette.accent.danger.dark).toBe('#ff6b6b');
  });

  it('hands back the dark side as a value, role included', () => {
    const inverted = darkOf(palette.surface.page);

    expect(inverted.css).toBe('#0b0d11');
    // The dark side of a surface is still a surface: an axis constrained to
    // colours of a given role must not lose the role on the way.
    expect(inverted.role).toBe('surface');
  });

  it('says "unknown role" rather than guessing one', () => {
    const custom = definePalette({
      brand: { primary: { light: '#123456', dark: '#654321' } },
    });

    expect(custom.brand.primary.role).toBe('none');
    expect(custom.brand.primary.css).toBe('#123456');
  });
});

describe('the marked way out', () => {
  it('compiles, and leaves a trace', () => {
    const escape = unsafeLength('13px', 'aligns with a legacy image');

    expect(escape.css).toBe('13px');
    // The debt is not forbidden, it is countable — which is what makes it
    // visible in the graph instead of pushed outside the design system.
    expect(escape.unproven).toBe('aligns with a legacy image');
    expect(space(4).unproven).toBe('');
  });

  it('quotes and sanitises the three types the generator cannot close', () => {
    expect(ident('my-name').css).toBe('my-name');
    // A stray `}` in an ident would close the rule and let anything follow.
    expect(ident('bad}name{').css).toBe('badname');
    expect(num(0.5).css).toBe('0.5');
    expect(int(2.7).css).toBe('2');
  });
});
