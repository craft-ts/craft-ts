import { readFileSync } from 'node:fs';
import { test, craftSession, expect } from './fixtures';

/**
 * The quantities of the server carts, read from the run's own store: the
 * server cart shows nowhere in the shop, so the server is where its sync is
 * seen.
 */
function serverCartQuantities(): number[] {
  const store = process.env['CRAFT_DEMO_ECOMMERCE_STORE'];
  if (!store) throw new Error('CRAFT_DEMO_ECOMMERCE_STORE is not set.');
  try {
    const data = JSON.parse(readFileSync(store, 'utf8')) as {
      carts?: { lines: { quantity: number }[] }[];
    };
    return (data.carts ?? []).map((cart) =>
      cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    );
  } catch {
    return [];
  }
}

test('parcourt boutique, panier et confirmation de commande', {
  annotation: craftSession({ id: 'shop.checkout', keep: 1 }),
}, async ({ page, craftSessions }) => {
  await craftSessions.step('ouvrir la boutique', async () => {
    await page.goto('/catalogue');
    await page.getByRole('button', { name: '+ Ajouter' }).first().click();
    // The added product reaches the server cart, not only the page.
    await expect.poll(serverCartQuantities).toEqual([1]);
  });
  await craftSessions.step('confirmer la commande', async () => {
    await page.getByRole('link', { name: /Panier/ }).click();
    await page.getByRole('link', { name: /Passer commande/ }).click();
    await page.getByRole('button', { name: 'Confirmer la commande' }).click();
    await expect(page.getByText('Merci pour votre commande')).toBeVisible();
  });
});
