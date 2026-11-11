import { expect, it } from 'vitest';
import { openDashboard } from '../../../test/dashboard-page';

it('shows the sessions the suite keeps for the app, and what each one alone shows', async () => {
  const { shown, click } = await openDashboard('/suite');
  await shown('suite-page');
  // Of the archive's checkouts, only the one recorded by hand is a candidate.
  const sessions = await shown('suite-session');
  expect(sessions).toHaveLength(1);
  const facts = (await shown('suite-facts'))[0]!.textContent ?? '';
  expect(facts).toContain('Sessions examinées1');
  expect(facts).toContain('Sessions gardées1');
  expect((await shown('suite-unique-unit')).length).toBeGreaterThan(0);

  // Replayed by the archive as the suite runs it: the row gives the outcome.
  await click('suite-replay-session');
  await shown('suite-replay-result', 'Rejouée sans écart · 14/14 actions');

  // The whole suite at once, as after a change: how many replayed clean.
  await click('suite-replay-all');
  await shown('suite-run-summary', '1 session(s) sur 1 sans écart');
});
