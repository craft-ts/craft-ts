# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps/demo/e2e/routed-functional-components.spec.ts >> updates routed functional component inputs when Angular reuses the route
- Location: apps/demo/e2e/routed-functional-components.spec.ts:34:5

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/query/1", waiting until "load"

```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test('uses client-side routing for the application tabs', async ({ page }) => {
  4  |   await page.goto('/');
  5  |   await page.evaluate(() => {
  6  |     (window as Window & { craftNavigationMarker?: string })
  7  |       .craftNavigationMarker = 'preserved';
  8  |   });
  9  | 
  10 |   await page.getByRole('link', { name: 'Query', exact: true }).click();
  11 | 
  12 |   await expect(page).toHaveURL(/\/query\/1$/);
  13 |   await expect
  14 |     .poll(() =>
  15 |       page.evaluate(
  16 |         () =>
  17 |           (window as Window & { craftNavigationMarker?: string })
  18 |             .craftNavigationMarker,
  19 |       ),
  20 |     )
  21 |     .toBe('preserved');
  22 | });
  23 | 
  24 | test('runs a routed functional component method after its factory has settled', async ({
  25 |   page,
  26 | }) => {
  27 |   await page.goto('/craft/mutation/1');
  28 | 
  29 |   await page.getByRole('button', { name: 'Next user' }).click();
  30 | 
  31 |   await expect(page).toHaveURL(/\/craft\/mutation\/2$/);
  32 | });
  33 | 
  34 | test('updates routed functional component inputs when Angular reuses the route', async ({
  35 |   page,
  36 | }) => {
> 37 |   await page.goto('/query/1');
     |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  38 |   await expect(page.locator('main pre')).toContainText('"id": "1"');
  39 | 
  40 |   await page.getByRole('button', { name: 'Next user' }).click();
  41 | 
  42 |   await expect(page).toHaveURL(/\/query\/2$/);
  43 |   await expect(page.locator('main pre')).toContainText('"id": "2"');
  44 | });
  45 | 
  46 | test('shows the view-transition skeleton while the detail chain is pending', async ({
  47 |   page,
  48 | }) => {
  49 |   await page.goto('/view-transitions');
  50 | 
  51 |   page.once('dialog', (dialog) => void dialog.accept());
  52 |   await page.getByRole('button', { name: '🗑️ Clear Cache' }).click();
  53 |   await page.waitForLoadState('domcontentloaded');
  54 | 
  55 |   await page.locator('a[href="/view-transitions/aurora"]').click();
  56 | 
  57 |   await expect(page).toHaveURL(/\/view-transitions\/aurora$/);
  58 |   await expect(page.locator('.vt-bar')).toHaveCount(3, { timeout: 1500 });
  59 |   await expect(page.getByRole('heading', { name: 'Aurora' })).toBeVisible({
  60 |     timeout: 4500,
  61 |   });
  62 | });
  63 | 
```