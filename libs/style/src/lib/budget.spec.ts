/**
 * The axis budget.
 *
 * Three ways this check managed to be silently vacuous while being written, all
 * caught by the two cases below rather than by reading it:
 *
 * - `Budget` defaulting to `[]` made every sheet in the repo out of budget.
 *   Defaulting to `never` is what makes the budget opt-in.
 * - The check placed on the sheet parameter is evaluated while `Budget` is
 *   still being inferred from the third one, so it checked nothing. It rides on
 *   the options parameter now.
 * - `Budget[number][string]` read the declared axes off a union, and `keyof` a
 *   union is the keys its members share — none. A budget of two axes declared
 *   nothing at all; the fix is a naked parameter that distributes.
 *
 * A negative test that never went red would have shipped all three.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  at,
  defineBreakpoints,
  defineStateAxis,
  scheme,
} from './axes/index.ts';
import { display, p } from './props/index.ts';
import { space } from './tokens/scales.ts';
import { unit } from './tokens/units.ts';
import {
  craftStyles,
  registeredClasses,
  resetStyleRegistry,
  when,
} from './styles.ts';

const bp = defineBreakpoints({ md: at.minInlineSize(unit.rem(48)) });
const tone = defineStateAxis('tone', ['danger']);

beforeEach(resetStyleRegistry);

describe('a sheet may declare what it is allowed to vary on', () => {
  it('accepts the axes it declared', () => {
    const sheet = craftStyles(
      'card',
      { root: [when(bp.md, [p(space(4))]), when(scheme.dark, [p(space(2))])] },
      { axes: [bp, scheme] },
    );

    expect(sheet.root.split(' ')).toHaveLength(2);
  });

  it('refuses an axis outside the budget, and names it', () => {
    const _rejected = () => {
      craftStyles(
        'card',
        {
          root: [when(bp.md, [p(space(4))]), when(tone.danger, [p(space(2))])],
        },
        // @ts-expect-error `tone` is used by the sheet and not in the budget
        { axes: [bp] },
      );
    };
    expect(_rejected).toBeTypeOf('function');

    // And at runtime too, because the sheet is evaluated in Node at build time
    // and a cast should not be able to buy its way past the budget.
    expect(() =>
      craftStyles(
        'card',
        { root: [when(tone.danger, [p(space(2))])] } as never,
        { axes: [bp] },
      ),
    ).toThrow(/not in its budget/);
  });

  it('leaves an unbudgeted sheet alone', () => {
    // Every sheet written before the budget existed must keep compiling; the
    // budget is a decision a sheet opts into, not a tax on all of them.
    expect(() =>
      craftStyles('free', { root: [when(tone.danger, [p(space(2))])] }),
    ).not.toThrow();
  });

  it('reports an axis declared and never used', () => {
    craftStyles('card', { root: [display.block] }, { axes: [bp, tone] });

    // Not an error — a budget is an upper bound — but dead weight a reader
    // takes for a real variation, so the graph reports it in wave 4.
    expect(registeredClasses()[0].unusedAxes).toEqual(['tone', 'viewport']);
  });
});
