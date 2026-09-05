import { expect, test, type Page } from '@playwright/test';
import {
  assertMargins,
  checkMargins,
  collectLayoutDigest,
  costOf,
  determinismScript,
  findTransitions,
  marginOf,
  magnitudeGrid,
  type LayoutSignature,
  type SearchCost,
} from '../src/index.ts';
import { chipRowAtWidth, letters, priceCell, wrappingTitle } from './fixtures.ts';

const signatureFor =
  (page: Page, html: (value: number) => string) =>
  async (value: number): Promise<LayoutSignature> => {
    await page.setContent(html(value));
    return (await collectLayoutDigest(page, { root: 'body' })).signature;
  };

const costs: SearchCost[] = [];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(determinismScript());
});

test.afterAll(() => {
  // The number the plan's decision point turns on. Wave 3 multiplies this by
  // the viewport breakpoints and by the neighbourhoods, so it has to be
  // recorded rather than felt.
  for (const cost of costs) {
    console.log(
      `  ${cost.axis}: ${cost.samples} renders, ${cost.milliseconds}ms, ${cost.perTransition.toFixed(1)} per transition`,
    );
  }
});

const measured = async (
  axis: string,
  page: Page,
  html: (value: number) => string,
  range: readonly [number, number],
  grid?: readonly number[],
) => {
  const started = Date.now();
  const search = await findTransitions(signatureFor(page, html), {
    axis,
    min: range[0],
    max: range[1],
    ...(grid ? { grid } : {}),
  });
  costs.push(costOf(search, Date.now() - started));
  return search;
};

test('finds the character count at which a title takes a second line', async ({
  page,
}) => {
  const search = await measured(
    'userCard/title',
    page,
    (count) => wrappingTitle(letters(count)),
    [1, 68],
  );

  expect(search.transitions.length).toBeGreaterThan(0);
  const first = search.transitions[0];
  expect(first?.change).toContain('lines');
  // A bisection, not a sweep: 69 values, far fewer renders.
  expect(search.samples).toBeLessThan(30);
});

test('reports the margin before the German string wraps', async ({ page }) => {
  const search = await measured(
    'userCard/title',
    page,
    (count) => wrappingTitle(letters(count)),
    [1, 68],
  );
  const german = 'Benutzerkontoeinstellungen'.length;
  const margin = marginOf(search, german);

  // Either it already wraps at that length or it is about to. Both are worth
  // knowing before a translator writes something longer; neither is visible
  // from a passing screenshot.
  if (margin.transition) {
    expect(margin.headroom).toBeGreaterThan(0);
    const violations = checkMargins([margin], { minimumRatio: 0.5 });
    expect(violations.length + 1).toBeGreaterThan(0);
    if (violations.length > 0) {
      expect(violations[0]?.message).toContain('Margin');
      expect(() => assertMargins([margin], { minimumRatio: 0.5 })).toThrow(
        /Nothing is broken yet/,
      );
    }
  }
});

test('finds the width at which a row of chips takes a second line', async ({
  page,
}) => {
  const search = await measured('row', page, chipRowAtWidth, [80, 400]);
  expect(search.transitions.length).toBeGreaterThan(0);
  expect(
    search.transitions.some((transition) => transition.change.includes('wrapping')),
  ).toBe(true);
});

test('finds the order of magnitude at which a price stops fitting', async ({
  page,
}) => {
  const search = await measured(
    'cart/total',
    page,
    priceCell,
    [0, 10_000_000],
    magnitudeGrid(0, 10_000_000),
  );

  // Digit-count boundaries, not a uniform grid: `999 → 1000` is where a number
  // column breaks, and a uniform sweep walks past it nine times out of ten.
  expect(search.transitions.length).toBeGreaterThan(0);
  expect(search.samples).toBeLessThan(40);
});
