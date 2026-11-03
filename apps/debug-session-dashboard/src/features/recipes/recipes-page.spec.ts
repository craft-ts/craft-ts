import { it } from 'vitest';
import { openDashboard } from '../../../test/dashboard-page';

it('lists the recipes, then opens one with its steps and its session', async () => {
  const { shown, click } = await openDashboard('/recipes');
  await click('recipe-card', 'Reprendre le panier avant la commande');
  await shown('recipe-steps');
  await shown('recipe-source-session');
});
