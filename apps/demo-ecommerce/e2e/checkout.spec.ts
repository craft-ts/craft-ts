import { test, craftSession } from './fixtures';

test('parcourt boutique, panier et confirmation de commande', {
  annotation: craftSession({ id: 'shop.checkout', keep: 1 }),
}, async ({ page, craftSessions }) => {
  await craftSessions.step('ouvrir la boutique', async () => {
    await page.goto('/catalogue');
    await page.getByRole('button', { name: '+ Ajouter' }).first().click();
  });
  await craftSessions.step('confirmer la commande', async () => {
    await page.getByRole('link', { name: /Panier/ }).click();
    await page.getByRole('link', { name: /Passer commande/ }).click();
    await page.getByRole('button', { name: 'Confirmer la commande' }).click();
    await page.getByText('Merci pour votre commande').waitFor();
  });
});
