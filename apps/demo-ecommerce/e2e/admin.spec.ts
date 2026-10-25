import { test, craftSession, expect } from './fixtures';

test('se connecter et modifier un produit dans l’administration', {
  annotation: craftSession({ id: 'admin.edit-product', keep: 1 }),
}, async ({ page, craftSessions }) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: /Se connecter en tant que Camille/ }).click();
  await page.getByRole('link', { name: 'Mon compte' }).waitFor();
  await craftSessions.step('modifier le stock', async () => {
    await page.goto('/admin');
    // By name: the list is re-sorted once a product is saved.
    const control = page.locator('.admin-row').filter({ hasText: 'Flat white' }).locator('.stock-control');
    const stock = control.locator('.stock-value');
    await expect(stock).toHaveText(/^\d+ en stock$/);
    const before = Number.parseInt(await stock.innerText(), 10);
    await control.getByRole('button', { name: 'Ajouter une unité au stock' }).click();
    await expect(stock).toHaveText(`${before + 1} en stock`);
  });
});
