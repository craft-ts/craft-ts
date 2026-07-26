import { expect, test } from '@playwright/test';

test('uses client-side routing for the application tabs', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as Window & { craftNavigationMarker?: string })
      .craftNavigationMarker = 'preserved';
  });

  await page.getByRole('link', { name: 'Query', exact: true }).click();

  await expect(page).toHaveURL(/\/query\/1$/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { craftNavigationMarker?: string })
            .craftNavigationMarker,
      ),
    )
    .toBe('preserved');
});

test('runs a routed functional component method after its factory has settled', async ({
  page,
}) => {
  await page.goto('/craft/mutation/1');

  await page.getByRole('button', { name: 'Next user' }).click();

  await expect(page).toHaveURL(/\/craft\/mutation\/2$/);
});

test('updates routed functional component inputs when Angular reuses the route', async ({
  page,
}) => {
  await page.goto('/query/1');
  await expect(page.locator('main pre')).toContainText('"id": "1"');

  await page.getByRole('button', { name: 'Next user' }).click();

  await expect(page).toHaveURL(/\/query\/2$/);
  await expect(page.locator('main pre')).toContainText('"id": "2"');
});
