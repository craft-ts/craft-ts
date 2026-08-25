import { expect, test } from '@playwright/test';
import { applyScenario, visualMatrix } from '@craft-ts/style-testing';
import { backToTop } from '../src/app/examples/design-system/scroll.style.ts';

test('keeps Back to top sticky throughout the scroll port', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'scroll-state container queries are currently supported by Chromium only',
  );

  await page.goto('/design-system/scroll');

  const port = page.locator('[data-scroll-port] > *');
  const button = page.locator('button[data-craft-name="backToTop"]');
  const anchor = button.locator('xpath=..');
  await expect(port).toHaveCSS('overflow-y', 'auto');
  await expect(anchor).toHaveCSS('position', 'sticky');
  await expect(button).toHaveCSS('visibility', 'hidden');

  const scenarios = visualMatrix(backToTop);
  expect(scenarios.map((entry) => entry.id)).toEqual([
    'base',
    'scrollState.scrollable=blockStart',
  ]);
  const scrollableScenario = scenarios[1];

  expect(scrollableScenario.drivers).toEqual([
    {
      axis: 'scrollState.scrollable',
      point: 'blockStart',
      driver: { kind: 'scroll', to: 'end' },
    },
  ]);
  await applyScenario(page, scrollableScenario, {
    target: '[data-scroll-port] > *',
  });

  await expect(button).toHaveCSS('visibility', 'visible');

  const initialAnchor = await anchor.boundingBox();
  const portBox = await port.boundingBox();
  expect(initialAnchor).not.toBeNull();
  expect(portBox).not.toBeNull();

  const scrollHeight = await port.evaluate((element) => element.scrollHeight);
  const clientHeight = await port.evaluate((element) => element.clientHeight);
  const scrollPositions = [
    0,
    (scrollHeight - clientHeight) / 2,
    scrollHeight - clientHeight,
  ];

  for (const scrollTop of scrollPositions) {
    await port.evaluate((element, top) => {
      element.scrollTop = top;
    }, scrollTop);
    await expect
      .poll(() => port.evaluate((element) => element.scrollTop))
      .toBe(scrollTop);

    const anchorBox = await anchor.boundingBox();
    expect(anchorBox).not.toBeNull();
    expect(anchorBox!.y).toBeCloseTo(initialAnchor!.y, 0);

    await expect(button).toHaveCSS(
      'visibility',
      scrollTop === 0 ? 'hidden' : 'visible',
    );
  }
});
