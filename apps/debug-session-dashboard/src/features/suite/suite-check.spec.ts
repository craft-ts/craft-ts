import { expect, it, vi } from 'vitest';
import { openDashboard } from '../../../test/dashboard-page';

it('shows the last check of the app, and approves a wanted change from it', async () => {
  const { shown, click, visible } = await openDashboard('/suite');
  await shown('suite-check-builds', 'main (abc1234) → arbre de travail');
  await shown('suite-check-verdict', 'À regarder');
  // The sessions to look at, regressions first; the unchanged one is left out.
  const rows = await shown('suite-check-session');
  expect(rows).toHaveLength(2);
  expect(rows[0]!.textContent).toContain('Régression');
  expect(rows[1]!.textContent).toContain('Changement à approuver');
  expect(rows[1]!.textContent).toContain('moment(s) 3, 5');
  // Only the change can be approved: a regression is fixed.
  const approve = await shown('suite-approve-change');
  expect(approve).toHaveLength(1);
  expect(rows[1]!.contains(approve[0]!)).toBe(true);

  await click('suite-approve-change');
  await shown('suite-check-session-verdict', 'Changement approuvé');
  // Approved, the change has nothing left to approve.
  await vi.waitFor(() => expect(visible('suite-approve-change')).toHaveLength(0));
}, 20_000);
