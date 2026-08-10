import { expect, test } from '@playwright/test';

test('keeps projected action buttons styled before hover', async ({ page }) => {
  await page.goto('/content-projection');

  const buttons = page.locator(
    '.projection-demo__case .projection-demo__action, .projection-demo__case .projection-demo__toggle',
  );

  await expect(buttons).toHaveCount(5);
  await expect
    .poll(() =>
      buttons.evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            color: style.color,
          };
        }),
      ),
    )
    .toEqual(
      Array.from({ length: 5 }, () => ({
        backgroundColor: 'rgb(37, 99, 235)',
        color: 'rgb(255, 255, 255)',
      })),
    );
});
