/**
 * The generated table.
 *
 * The load-bearing test here is the **generic conformance check**: it walks
 * every export of `generated.ts` and asserts that none of them accepts a
 * string. Hand-written cases would only cover the helpers someone thought of,
 * and would say nothing about the four hundred others — or about the ones a
 * future regeneration adds.
 *
 * Falsifiability check (run by hand when the table changes shape): add
 *   `export const bogus = (value: string) => declaration('bogus', value);`
 * to `generated.ts`. `NoHelperTakesAString` stops being `never` and the type
 * assertion goes red. Confirmed red before this file was committed, then removed.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import {
  EXCLUSIONS,
  EXPECTED_COVERED,
} from '../../../../../tools/css-props.data.mjs';
import { global, type Declaration } from './factory.ts';
import * as generated from './generated.ts';
import { bg, font, p, px, radius } from './index.ts';
import { palette } from '../tokens/palette.ts';
import { radii, space, text } from '../tokens/scales.ts';
import { num, unit } from '../tokens/units.ts';

// ─── the conformance check ──────────────────────────────────────────────────

type Generated = typeof generated;

/** A helper "takes a string" if a bare string is assignable to its argument. */
type TakesAString<Helper> = Helper extends (...args: infer Args) => unknown
  ? Args extends readonly [infer First, ...unknown[]]
    ? [string] extends [First]
      ? true
      : false
    : false
  : false;

type NoHelperTakesAString = {
  [Key in keyof Generated]: TakesAString<Generated[Key]> extends true
    ? Key
    : never;
}[keyof Generated];

type _conformance = Expect<Equal<NoHelperTakesAString, never>>;

describe('no signature in the table takes a string', () => {
  it('rejects raw values on the helpers people actually reach for', () => {
    p(space(4));
    px(space(3));
    bg(palette.surface.raised);
    radius(radii.full);

    // @ts-expect-error a length is not a string
    p('blabla');
    // @ts-expect-error a colour is not a keyword string
    bg('red');
    // @ts-expect-error a gap is not a number in a string
    generated.gap('2');
    // @ts-expect-error a radius is not a scale name
    radius('md');
    // @ts-expect-error a colour is not a length
    p(palette.text.strong);

    expect(p(space(4))).toEqual({
      property: 'padding',
      value: '1rem',
      unproven: '',
    });
  });

  it('exposes closed keyword sets as members, not as arguments', () => {
    expect(generated.display.inlineFlex).toEqual({
      property: 'display',
      value: 'inline-flex',
      unproven: '',
    });
    expect(generated.position.sticky.value).toBe('sticky');
    // A hyphenated keyword reads camel-cased; the CSS text is never retyped.
    expect(generated.inlineSize.minContent.value).toBe('min-content');

    // Never called: a keyword set is not callable, so running these would
    // throw rather than demonstrate anything. The typecheck is the point.
    const _rejected = () => {
      // @ts-expect-error a typo is a missing property, not ignored CSS
      generated.display.inlineFlexx;
      // @ts-expect-error and a keyword is not something you pass in
      generated.position('sticky');
    };
    expect(_rejected).toBeTypeOf('function');
  });

  it('routes the CSS-wide keywords through tokens only', () => {
    expect(global.inherit(generated.prop.color)).toEqual({
      property: 'color',
      value: 'inherit',
      unproven: '',
    });

    // @ts-expect-error a property name is a token, not any string
    global.inherit('color');
    // @ts-expect-error and a helper never accepts the global as a value
    generated.color('inherit');
  });
});

describe('what the table refuses to contain', () => {
  it('has no overflow, so the only path stays provides(scrollPort)', () => {
    for (const excluded of EXCLUSIONS) {
      expect(Object.values(generated.prop)).not.toContain(excluded);
    }
    expect('overflow' in generated).toBe(false);
    expect('overflowBlock' in generated).toBe(false);
    expect('containerType' in generated).toBe(false);
  });

  it('leaves nothing common in the uncovered list', () => {
    const uncovered = new Set<string>(generated.UNCOVERED_PROPERTIES);

    expect(EXPECTED_COVERED.filter((name) => uncovered.has(name))).toEqual([]);
    // The ones that remain are genuinely composite shorthands, and each is
    // reachable through its longhands.
    expect([...uncovered].sort()).toEqual([
      'background',
      'border-image-slice',
      'grid',
      'offset',
      'text-indent',
    ]);
  });

  it('says out loud which helpers are narrower than CSS', () => {
    // A narrowed helper only refuses forms CSS would have allowed; it can never
    // emit CSS the browser rejects. Saying so is what keeps it from looking
    // like an oversight.
    expect(generated.NARROWED_PROPERTIES.length).toBeGreaterThan(0);
    expect(generated.NARROWED_PROPERTIES).toContain('animation');
  });
});

describe('the table is generated, and stays that way', () => {
  it('regenerates to exactly what is committed', () => {
    // Rerunning the generator in CI is what stops the table from ageing behind
    // the spec: a keyword added upstream shows up as a failing test.
    expect(() =>
      execFileSync('node', ['tools/generate-css-props.mjs', '--check'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('carries the marker that says not to edit it by hand', () => {
    const source = readFileSync(
      'libs/style/src/lib/props/generated.ts',
      'utf8',
    );
    expect(source).toContain('GENERATED by');
  });
});

describe('the short names are aliases, never second definitions', () => {
  it('keeps p, px, py and bg pointing at the generated helpers', () => {
    expect(p).toBe(generated.padding);
    expect(px).toBe(generated.paddingInline);
    expect(bg).toBe(generated.backgroundColor);
    expect(radius).toBe(generated.borderRadius);
  });

  it('emits a size and its line height together', () => {
    const declarations: readonly Declaration[] = font(text.sm);

    expect(declarations.map((rule) => rule.property)).toEqual([
      'font-size',
      'line-height',
    ]);
    expect(declarations[1].value).toBe('1.25rem');
  });

  it('accepts a number where CSS asks for one', () => {
    expect(generated.opacity(num(0.5)).value).toBe('0.5');
    expect(generated.lineHeight(unit.rem(1.5)).value).toBe('1.5rem');
  });
});
