import { expect, test } from '@playwright/test';

test('keeps projected action buttons styled before hover', async ({ page }) => {
  await page.goto('/content-projection');

  const buttons = page.getByTestId('projection-case').locator('button');

  await expect(buttons).toHaveCount(5);
  await expect(buttons.first()).toHaveCSS('height', '42px');
  await expect(buttons.first()).toHaveCSS('font-weight', '600');
  const colors = await buttons.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.color] as const;
    }),
  );
  expect(new Set(colors.map(([background]) => background)).size).toBe(1);
  expect(new Set(colors.map(([, foreground]) => foreground)).size).toBe(1);
  expect(colors[0]?.[0]).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors[0]?.[0]).not.toBe(colors[0]?.[1]);
});
