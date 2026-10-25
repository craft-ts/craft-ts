import { test, craftSession, expect } from './fixtures';

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

  // The attempt's own session, by its run id: never another run of this test.
  const server = process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] ?? 'http://127.0.0.1:4322';
  const query = new URLSearchParams({ testId: 'admin.multicontext', runId: craftSessions.runId ?? '' });
  await expect.poll(async () => {
    const listing = await fetch(`${server}/sessions?${query}`).then((response) => response.json()) as { sessions: Array<{ participantCount: number }> };
    return listing.sessions.map((session) => session.participantCount);
  }, { timeout: 10_000 }).toEqual([2]);
});
