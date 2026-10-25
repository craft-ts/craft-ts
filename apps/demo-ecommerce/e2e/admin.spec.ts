import { test, craftSession } from './fixtures';

test('se connecter et modifier un produit dans l’administration', {
  annotation: craftSession({ id: 'admin.edit-product', keep: 1 }),
}, async ({ page, craftSessions }) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: /Se connecter en tant que Camille/ }).click();
  await page.getByRole('link', { name: 'Mon compte' }).waitFor();
  await craftSessions.step('modifier le stock', async () => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Ajouter une unité au stock' }).first().click();
  });
});
