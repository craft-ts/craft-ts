import { expect, test } from '@playwright/test';

test('scopes nested Craft component styles and shares their sheets', async ({
  page,
}) => {
  await page.goto('/craft-service/counter');

  const parent = page.locator('[data-craft-root~="App"]').first();
  const child = page
    .locator('[data-craft-root~="CraftServiceCounterComponent"]')
    .first();
  await expect(parent).toBeVisible();
  await expect(child).toBeVisible();

  await expect
    .poll(() => parent.evaluate((element) => getComputedStyle(element).display))
    .toBe('flex');
  await expect
    .poll(() =>
      child.evaluate((element) => getComputedStyle(element).paddingTop),
    )
    .toBe('32px');

  const counts = await page.evaluate(() => {
    const cssText = (sheet: CSSStyleSheet) =>
      Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
    const adopted = Array.from(document.adoptedStyleSheets ?? []).map(cssText);
    const fallback = Array.from(
      document.querySelectorAll<HTMLStyleElement>('style[data-craft-sheet]'),
    ).map((element) => element.textContent ?? '');
    const sheets = [...adopted, ...fallback];
    return {
      parentSheets: sheets.filter((text) => text.includes('App')).length,
      childSheets: sheets.filter((text) =>
        text.includes('CraftServiceCounterComponent'),
      ).length,
    };
  });
  expect(counts).toEqual({ parentSheets: 1, childSheets: 1 });
});
