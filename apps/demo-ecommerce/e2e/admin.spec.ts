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
    const row = page.getByRole('list', { name: 'Produits' }).getByRole('listitem').filter({ hasText: 'Flat white' });
    const stock = row.getByText(/^\d+ en stock$/);
    await expect(stock).toBeVisible();
    const before = Number.parseInt(await stock.innerText(), 10);
    await row.getByRole('button', { name: 'Ajouter une unité au stock' }).click();
    await expect(stock).toHaveText(`${before + 1} en stock`);
  });
});
