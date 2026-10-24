import { test, craftSession, expect } from './fixtures';

test('parcourt boutique, panier et confirmation de commande', {
  annotation: craftSession({ id: 'shop.checkout', keep: 1 }),
}, async ({ page, craftSessions }) => {
  test.setTimeout(120_000);
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

  const runId = await page.evaluate(() =>
    (globalThis as typeof globalThis & { __craftDebugSession?: { id(): string } })
      .__craftDebugSession?.id(),
  );
  expect(runId).toBeTruthy();
  const report = await page.context().newPage();
  const dashboardOrigin = process.env['CRAFT_E2E_SESSION_DASHBOARD_ORIGIN'] ?? 'http://localhost:4210';
  await report.goto(`${dashboardOrigin}/#/compare?${new URLSearchParams({ test: 'shop.checkout', project: 'chromium', run: runId! })}`);
  await expect(report.locator('[data-lab="e2e-comparison-json"]')).not.toContainText('En attente du serveur local', { timeout: 30_000 });

  for (const side of ['baseline', 'observed']) {
    const frame = report.frameLocator(`[data-lab="e2e-replay-${side}"]`);
    const detail = frame.locator('[data-lab="detail-page"]');
    await expect.poll(() => detail.getAttribute('data-replay-state'), { timeout: 45_000 }).toMatch(/^(ready|playing|completed|error)$/);
  }
  await report.close();
});
