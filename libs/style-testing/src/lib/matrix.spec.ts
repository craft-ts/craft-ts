/**
 * What the matrix promises.
 *
 * Falsifiability check (run by hand when the identifier changes): make
 * `identify` list every axis instead of only the ones away from `base` — and
 * "an unrelated axis does not invalidate the existing identifiers" goes red.
 * Confirmed red before this file was committed, then put back.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  at,
  craftStyles,
  defineBreakpoints,
  defineStateAxis,
  display,
  p,
  resetStyleRegistry,
  scheme,
  space,
  unit,
  when,
} from '@craft-ts/style';
import { branch, contentCases, visualMatrix } from './matrix.ts';
import { orderedDrivers, toPixels } from './drivers.ts';
import {
  assertExhaustiveVisualMatrix,
  baselinesIn,
  coverageOf,
} from './exhaustive.ts';

const bp = defineBreakpoints({
  sm: at.minInlineSize(unit.rem(30)),
  md: at.minInlineSize(unit.rem(48)),
  lg: at.minInlineSize(unit.rem(64)),
});
const tone = defineStateAxis('tone', ['danger', 'success']);

beforeEach(resetStyleRegistry);

describe('a component with no axis has one way to look', () => {
  it('produces a single scenario named base', () => {
    const sheet = craftStyles('plain', { root: [display.block] });
    const matrix = visualMatrix(sheet);

    expect(matrix).toHaveLength(1);
    expect(matrix[0].id).toBe('base');
    expect(matrix[0].drivers).toEqual([]);
  });
});

describe('the matrix keeps only the points the sheets cross', () => {
  it('gives three viewport cells for two cut points, not four', () => {
    const sheet = craftStyles('card', {
      root: [when(bp.md, [p(space(4))])],
      footer: [when(bp.lg, [p(space(6))])],
    });

    // `bp` defines sm, md and lg. Two of them are crossed, so the axis has
    // three cells: base, md, lg.
    const matrix = visualMatrix(sheet);
    expect(matrix.map((scenario) => scenario.id)).toEqual([
      'base',
      'viewport=lg',
      'viewport=md',
    ]);
  });

  it('multiplies across axes and nothing else', () => {
    const sheet = craftStyles('badge', {
      root: [
        when(bp.md, [p(space(4))]),
        when(scheme.dark, [p(space(2))]),
        when(tone.danger, [p(space(1))]),
      ],
    });

    // 2 viewports × 2 schemes × 2 tones, base included.
    expect(visualMatrix(sheet)).toHaveLength(8);
  });

  it('accepts a sheet, a class string, or several of them', () => {
    const left = craftStyles('left', { root: [when(bp.md, [p(space(4))])] });
    const right = craftStyles('right', {
      root: [when(tone.danger, [p(space(2))])],
    });

    expect(visualMatrix([left, right])).toHaveLength(4);
    expect(visualMatrix(left.root)).toHaveLength(2);
  });
});

describe('the identifiers survive a change that does not concern them', () => {
  it('names only the axes away from base', () => {
    const sheet = craftStyles('card', {
      root: [when(bp.md, [p(space(4))]), when(scheme.dark, [p(space(2))])],
    });

    const ids = visualMatrix(sheet).map((scenario) => scenario.id);
    expect(ids).toEqual([
      'base',
      'viewport=md',
      'scheme=dark',
      'scheme=dark+viewport=md',
    ]);
  });

  it('leaves existing identifiers alone when an axis is added', () => {
    const before = craftStyles('card', { root: [when(bp.md, [p(space(4))])] });
    const beforeIds = visualMatrix(before).map((scenario) => scenario.id);

    resetStyleRegistry();
    const after = craftStyles('card', {
      root: [when(bp.md, [p(space(4))]), when(tone.danger, [p(space(2))])],
    });
    const afterIds = visualMatrix(after).map((scenario) => scenario.id);

    // An identifier that listed every axis would change the moment someone
    // adds one, and every baseline in the suite would be invalidated by a
    // change that affects none of them.
    for (const id of beforeIds) expect(afterIds).toContain(id);
  });
});

describe('every scenario carries what reaches it', () => {
  it('hands back the driver of each point away from base', () => {
    const sheet = craftStyles('badge', {
      root: [when(bp.md, [p(space(4))]), when(tone.danger, [p(space(2))])],
    });

    const both = visualMatrix(sheet).find(
      (scenario) => scenario.id === 'tone=danger+viewport=md',
    );
    expect(both?.drivers.map((entry) => entry.axis)).toEqual([
      'tone',
      'viewport',
    ]);
    // Stored sorted by axis — stable and readable — but applied in the order
    // the applier decides, which is emulation and layout before DOM state.
    expect(
      orderedDrivers(both!.drivers).map((entry) => entry.driver.kind),
    ).toEqual(['resize', 'setAttribute']);
  });

  it('prunes what the component makes unreachable', () => {
    const sheet = craftStyles('shell', {
      root: [when(tone.danger, [p(space(2))]), when(bp.md, [p(space(4))])],
    });

    // A state the component's own structure can never produce is not a state
    // to capture; leaving it in would add a picture identical to another one.
    const pruned = visualMatrix(sheet, { unreachable: ['tone'] });
    expect(pruned.map((scenario) => scenario.id)).toEqual([
      'base',
      'viewport=md',
    ]);
  });
});

describe('a branch adds, it does not multiply', () => {
  it('crosses the shared sheets with one side at a time', () => {
    const shell = craftStyles('shell', { root: [when(bp.md, [p(space(4))])] });
    const footer = craftStyles('footer', {
      root: [
        when(tone.danger, [p(space(2))]),
        when(tone.success, [p(space(1))]),
      ],
    });

    // The count is not the point — 8 against 6 here, because the shared axis is
    // crossed with each side. What matters is *which* states are produced: with
    // the sum, the side where the footer is absent never carries the footer's
    // tone axis. Those would be captures of pages that cannot exist.
    const summed = visualMatrix([shell, branch('footer', footer)]);
    const crossed = visualMatrix([shell, footer]);

    expect(crossed).toHaveLength(6);
    expect(summed).toHaveLength(8);
    // What matters is that the false side never carries the footer's axis:
    // those are pages that cannot exist.
    const absent = summed.filter(
      (scenario) => scenario.axes['footer'] === 'false',
    );
    expect(absent).toHaveLength(2);
    for (const scenario of absent)
      expect(scenario.axes['tone']).toBeUndefined();
  });

  it('names the branch in the identifier, on both sides', () => {
    const shell = craftStyles('shell', { root: [when(bp.md, [p(space(4))])] });
    const footer = craftStyles('footer', {
      root: [when(tone.danger, [p(space(2))])],
    });

    const ids = visualMatrix([shell, branch('footer', footer)]).map(
      (scenario) => scenario.id,
    );
    expect(ids).toContain('footer=true+tone=danger+viewport=md');
    expect(ids).toContain('footer=false');
  });

  it('keeps two branches independent of each other', () => {
    const header = craftStyles('header', {
      root: [when(tone.danger, [p(space(1))])],
    });
    const footer = craftStyles('footer', {
      root: [when(bp.md, [p(space(2))])],
    });

    // The sum applies *within* a branch — its two sides never coexist — not
    // between branches, which do. Header contributes 2 + 1 states, footer the
    // same, and the two conditions are independent: 3 × 3.
    const matrix = visualMatrix([
      branch('header', header),
      branch('footer', footer),
    ]);
    expect(matrix).toHaveLength(9);
  });
});

describe('a breakpoint becomes a viewport width', () => {
  it('turns a CSS length into pixels', () => {
    expect(toPixels('48rem')).toBe(768);
    expect(toPixels('640px')).toBe(640);
    expect(() => toPixels('80ch')).toThrow(/px, rem or em/);
  });
});

describe('content cases cross where space changes, and nowhere else', () => {
  it('renders a data case at one point of a non-spatial axis', () => {
    const sheet = craftStyles('card', {
      root: [when(bp.md, [p(space(4))]), when(scheme.dark, [p(space(2))])],
    });

    const withCases = contentCases(visualMatrix(sheet), {
      longTitle: 'x'.repeat(80),
      empty: '',
    });
    const ids = withCases.map((scenario) => scenario.id);

    // A long title behaves differently at two widths. It does not behave
    // differently in two colour schemes.
    expect(ids).toContain('base#longTitle');
    expect(ids).toContain('viewport=md#longTitle');
    expect(ids).not.toContain('scheme=dark#longTitle');
  });
});

describe('exhaustiveness is checked after inference, against real files', () => {
  it('reads baseline names out of a directory listing', () => {
    expect(baselinesIn(['base.png', 'viewport=md.png', 'README.md'])).toEqual([
      'base',
      'viewport=md',
    ]);
  });

  it('names the states nobody has ever looked at', () => {
    const sheet = craftStyles('card', { root: [when(bp.lg, [p(space(6))])] });
    const matrix = visualMatrix(sheet);

    expect(() => assertExhaustiveVisualMatrix(matrix, ['base'])).toThrow(
      /viewport=lg/,
    );
    expect(coverageOf(matrix, ['base']).missing).toEqual(['viewport=lg']);
  });

  it('fails on a baseline nothing produces any more', () => {
    const sheet = craftStyles('card', { root: [display.block] });

    // A baseline nothing produces still reads as coverage to whoever opens the
    // folder — it has to fail as loudly as a missing one.
    expect(() =>
      assertExhaustiveVisualMatrix(visualMatrix(sheet), [
        'base',
        'viewport=xl',
      ]),
    ).toThrow(/No longer produced/);
  });

  it('passes when the two agree', () => {
    const sheet = craftStyles('card', { root: [when(bp.md, [p(space(4))])] });

    expect(() =>
      assertExhaustiveVisualMatrix(visualMatrix(sheet), [
        'base',
        'viewport=md',
      ]),
    ).not.toThrow();
  });
});
