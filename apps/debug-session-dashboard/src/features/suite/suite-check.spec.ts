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
  // Base and head side by side, moment by moment, with what was measured.
  expect(visible('suite-check-moments')).toHaveLength(0);
  await click('suite-check-toggle');
  const moments = await shown('suite-check-moment');
  expect(moments.map((moment) => moment.textContent)).toEqual([
    expect.stringContaining('Action 3'),
    expect.stringContaining('absent de la tête'),
  ]);
  await shown('suite-check-measure', 'a.brand].styles.color : "rgb(35, 64, 52)" → "rgb(180, 35, 90)"');
  const head = (await shown('suite-check-head'))[0] as HTMLImageElement;
  expect(head.getAttribute('src')).toContain('/sessions/check/image?origin=http%3A%2F%2Flocalhost%3A4205&path=images%2F');
  expect(head.getAttribute('src')).toContain('003-head.png');
  // The moment the head did not reach has the base's picture only.
  expect(visible('suite-check-base')).toHaveLength(2);
  expect(visible('suite-check-head')).toHaveLength(1);
  expect(visible('suite-check-diff')).toHaveLength(1);

  // Only the change can be approved: a regression is fixed.
  const approve = await shown('suite-approve-change');
  expect(approve).toHaveLength(1);
  expect(rows[1]!.contains(approve[0]!)).toBe(true);

  await click('suite-approve-change');
  await shown('suite-check-session-verdict', 'Changement approuvé');
  // Approved, the change has nothing left to approve.
  await vi.waitFor(() => expect(visible('suite-approve-change')).toHaveLength(0));
}, 20_000);
