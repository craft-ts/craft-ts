import { test, craftSession } from './fixtures';

test('rattache les contextes boutique et administration à une session', {
  annotation: craftSession({ id: 'admin.multicontext', keep: 3, reason: 'Le parcours client et le contrôle admin partagent une session navigateur.' }),
}, async ({ page, craftSessions }) => {
  await page.goto('/catalogue');
  const admin = await craftSessions.newContext();
  const adminPage = await admin.newPage();
  await adminPage.goto('/admin');
  await adminPage.getByRole('button', { name: /Se connecter en tant que Camille/ }).click();
  await adminPage.getByRole('tab', { name: /Produits/ }).waitFor();
  await page.getByRole('heading', { name: 'La boutique' }).waitFor();
});
