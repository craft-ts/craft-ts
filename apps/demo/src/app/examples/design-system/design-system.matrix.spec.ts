/**
 * The visual matrix of the mini design system.
 *
 * This is the level-2 witness: for each component, every way it can be
 * displayed, enumerated rather than guessed. The cardinals below are recorded
 * on purpose — they are the first of the two measurements the plan wants before
 * wave 5 (matrix reduction) may be opened at all.
 *
 * The second measurement, CI capture time, does not exist yet: nothing captures.
 */
import { describe, expect, it } from 'vitest';
import {
  assertExhaustiveVisualMatrix,
  branch,
  contentCases,
  visualMatrix,
} from '@craft-ts/style-testing';
import { registeredClasses } from '@craft-ts/style';
import { alert, button, card, meter, stack } from './components.style.ts';
import { dsTheme } from './foundation.style.ts';

describe('what each component can look like', () => {
  it('records the cardinal of every sheet', () => {
    const cardinals = {
      theme: visualMatrix(dsTheme).length,
      stack: visualMatrix(stack).length,
      button: visualMatrix(button).length,
      card: visualMatrix(card).length,
      alert: visualMatrix(alert).length,
      meter: visualMatrix(meter).length,
    };

    // Read them as the plan's trigger for wave 5: median per component > 24.
    // The median here is 3, the maximum 18 — the reduction wave stays shut.
    expect(cardinals).toEqual({
      theme: 4, // viewport md × scheme dark
      stack: 1, // no axis at all
      button: 18, // 5 tones + base, × 2 sizes + base
      card: 2, // the single breakpoint it crosses
      alert: 6, // 5 tones + base
      meter: 1,
    });
  });

  it('names them the way a baseline file would', () => {
    expect(visualMatrix(card).map((scenario) => scenario.id)).toEqual([
      'base',
      'viewport=md',
    ]);
    expect(visualMatrix(dsTheme).map((scenario) => scenario.id)).toEqual([
      'base',
      'viewport=md',
      'scheme=dark',
      'scheme=dark+viewport=md',
    ]);
  });

  it('hands each scenario the drivers that reach it', () => {
    const dark = visualMatrix(dsTheme).find(
      (scenario) => scenario.id === 'scheme=dark+viewport=md',
    );

    expect(dark?.drivers.map((entry) => entry.driver)).toEqual([
      {
        kind: 'emulateMedia',
        feature: 'prefers-color-scheme',
        value: 'dark',
      },
      { kind: 'resize', minInlineSize: '48rem' },
    ]);
  });
});

describe('a sheet declares the axes it is allowed to spend', () => {
  it('records the budget the button opted into', () => {
    const root = registeredClasses().find(
      (registered) => registered.key === 'dsButton-root',
    );

    // The sheet declared tone and size; it uses both, so nothing is idle.
    // An axis added to this sheet without widening the budget stops the build.
    expect(root?.unusedAxes).toEqual([]);
    expect(Object.keys(root?.axes ?? {}).sort()).toEqual(['size', 'tone']);
  });
});

describe('a branch adds instead of multiplying', () => {
  it('keeps the absent branch free of the states it cannot show', () => {
    // The footer of a card is behind an `ifNode`: when it is not rendered,
    // its tones cannot be on screen. Crossed, the matrix asks for captures of
    // pages that cannot exist.
    const crossed = visualMatrix([dsTheme, card, alert]);
    const summed = visualMatrix([dsTheme, card, branch('footer', alert)]);

    // 2 viewports × 2 schemes × 6 tones = 24 crossed.
    // Summed: 4 shared cells × 6 tones with the alert, plus 4 without it.
    expect(crossed).toHaveLength(24);
    expect(summed).toHaveLength(28);
    // The count is not the point — the shared axes are crossed with each side,
    // so a sum can be larger. What matters is which states exist: with the
    // branch, no scenario has the alert's tone while the alert is absent.
    const absent = summed.filter(
      (scenario) => scenario.axes['footer'] === 'false',
    );
    expect(absent).toHaveLength(4);
    for (const scenario of absent) {
      expect(scenario.axes['tone']).toBeUndefined();
    }
  });
});

describe('the whole page, and what it would cost to capture', () => {
  it('multiplies across the sheets it composes', () => {
    // The page puts a theme, cards, buttons and an alert on screen at once.
    // 4 theme cells × 5+1 tones × 2+1 sizes = 72 — which is what a naive
    // "capture the page in every state" would cost, and why the matrix is per
    // component rather than per page.
    const page = visualMatrix([dsTheme, card, button, alert, stack, meter]);
    expect(page).toHaveLength(72);
  });

  it('crosses content cases only where the space changes', () => {
    const withData = contentCases(visualMatrix(card), {
      longTitle: 'x'.repeat(80),
      empty: '',
    });

    // Two viewport cells × (1 + 2 data cases) = 6, and no data case is
    // rendered twice in the same box for no reason.
    expect(withData).toHaveLength(6);
  });
});

describe('exhaustiveness, as a suite would use it', () => {
  it('names the states nobody has captured yet', () => {
    // There are no baselines in the repo: nothing captures yet, and this is
    // what the failure looks like — every state named, not a count.
    expect(() => assertExhaustiveVisualMatrix(visualMatrix(alert), [])).toThrow(
      /tone=danger/,
    );
  });

  it('passes once every scenario has a baseline', () => {
    const matrix = visualMatrix(card);

    expect(() =>
      assertExhaustiveVisualMatrix(
        matrix,
        matrix.map((scenario) => scenario.id),
      ),
    ).not.toThrow();
  });
});
