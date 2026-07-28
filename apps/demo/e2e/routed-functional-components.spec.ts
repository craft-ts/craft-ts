import { expect, test } from '@playwright/test';

test('uses client-side routing for the application tabs', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (
      window as Window & { craftNavigationMarker?: string }
    ).craftNavigationMarker = 'preserved';
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

test('navigates to the reactive component composition demo', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await page
    .getByRole('link', { name: 'Reactive Component Composition', exact: true })
    .click();

  await expect(page).toHaveURL(/\/component-composition$/);
  await expect(
    page.getByRole('heading', { name: 'Composition réactive avec providers' }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
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

test('shows the view-transition skeleton while the detail chain is pending', async ({
  page,
}) => {
  await page.goto('/view-transitions');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '🗑️ Clear Cache' }).click();
  await page.waitForLoadState('domcontentloaded');

  await page.locator('a[href="/view-transitions/aurora"]').click();

  await expect(page).toHaveURL(/\/view-transitions\/aurora$/);
  await expect(page.locator('.vt-bar')).toHaveCount(3, { timeout: 1500 });
  await expect(page.getByRole('heading', { name: 'Aurora' })).toBeVisible({
    timeout: 4500,
  });
});
