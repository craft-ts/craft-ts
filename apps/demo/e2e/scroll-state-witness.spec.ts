import { expect, test } from '@playwright/test';
import { applyScenario, visualMatrix } from '@craft-ts/style-testing';
import { backToTop } from '../src/app/examples/design-system/scroll.style.ts';

test('reveals Back to top at the end of the scroll port', async ({ page }) => {
  await page.goto('/design-system/scroll');

  const port = page.locator('[data-scroll-port] > *');
  const button = page.locator('button[data-craft-name="backToTop"]');
  await expect(port).toHaveCSS('overflow-y', 'auto');
  await expect(button).toHaveCSS('visibility', 'hidden');

  const scenarios = visualMatrix(backToTop);
  expect(scenarios.map((entry) => entry.id)).toEqual([
    'base',
    'scrollState.stuck=blockEnd',
  ]);
  const endScenario = scenarios[1];

  expect(endScenario.drivers).toEqual([
    {
      axis: 'scrollState.stuck',
      point: 'blockEnd',
      driver: { kind: 'scroll', to: 'end' },
    },
  ]);
  await applyScenario(page, endScenario, {
    target: '[data-scroll-port] > *',
  });

  await expect(button).toHaveCSS('visibility', 'visible');
});
