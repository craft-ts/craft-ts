import { expect, test } from '@playwright/test';

test('navigates to Craft Full Demo from the navbar without freezing', async ({
  page,
}) => {
  test.setTimeout(10_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Parcourir les exemples' }).click();

  const link = page.getByRole('link', {
    name: 'Craft Full Demo',
    exact: true,
  });
  await expect(link).toHaveCount(1);
  await link.click({ timeout: 2_000 });

  await expect(page).toHaveURL(/\/craft\/full-demo$/, { timeout: 2_000 });
  await expect(page.locator('input[placeholder="New todo"]')).toBeVisible({
    timeout: 3_000,
  });
  expect(pageErrors).toEqual([]);
});

test('does not activate Guard demo after its guard redirects', async ({
  page,
}) => {
  test.setTimeout(10_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Parcourir les exemples' }).click();

  await page.getByRole('link', { name: 'Guard demo', exact: true }).click({
    timeout: 2_000,
  });
  await expect(page).toHaveURL(/\/login-form$/, { timeout: 3_000 });
  await expect(
    page.getByText('Should not be displayed', { exact: true }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Parcourir les exemples' }).click();
  await page
    .getByRole('link', { name: 'craftService User Detail', exact: true })
    .click({ timeout: 2_000 });
  await expect(page).toHaveURL(/\/craft-service\/user-detail$/, {
    timeout: 3_000,
  });
  await expect(
    page.getByText('craftService User Detail (query)', { exact: true }),
  ).toBeVisible({ timeout: 3_000 });
  await expect(
    page.getByText('Should not be displayed', { exact: true }),
  ).toHaveCount(0);
  expect(
    consoleErrors.filter((message) => message.includes('CraftGenShortCircuit')),
  ).toEqual([]);
});

test('applies the user detail component styles after navigation', async ({
  page,
}) => {
  test.setTimeout(10_000);
  await page.goto('/craft-service/user-detail');

  const root = page.locator(
    '[data-craft-root="CraftServiceUserDetailComponent"]',
  );
  await expect(root).toBeVisible({ timeout: 3_000 });
  await expect(root).toHaveCSS('display', 'flex');
  await expect(root).toHaveCSS('padding', '32px');
  await expect(root.locator('.controls')).toBeVisible();
  await expect(root.locator('.card')).toHaveCSS('border-top-width', '1px');
});

test('applies the mutation component styles', async ({ page }) => {
  test.setTimeout(10_000);
  await page.goto('/mutation/1');

  const root = page.locator('[data-craft-root="MutationDemoComponent"]');
  await expect(root).toBeVisible({ timeout: 3_000 });
  await expect(root).toHaveCSS('background-color', 'rgb(35, 35, 35)');
  await expect(root.getByRole('button', { name: /Update name/ })).toHaveCSS(
    'background-color',
    'rgb(68, 68, 68)',
  );
});

test('applies the list with pagination styles', async ({ page }) => {
  test.setTimeout(10_000);
  await page.goto('/list-with-pagination');

  const root = page.locator('[data-craft-root="ListWithPagination"]');
  await expect(root).toBeVisible({ timeout: 3_000 });
  await expect(root.locator('table')).toHaveClass(/table/);
  await expect(root.locator('td').first()).toHaveCSS('padding', '16px');
  await expect(root.locator('.pagination')).toBeVisible();
});
