import { expect, it } from 'vitest';
import { openDashboard } from '../../../test/dashboard-page';

it('sorts what the tests of each app prove from what they still owe', async () => {
  const { shown } = await openDashboard('/coverage');
  const rows = await shown('coverage-row');
  const text = rows.map((row) => row.textContent).join(' ');
  // The unproven page of the shop, then its proven mutation.
  expect(text).toContain('demo-shop');
  expect(text).toContain('/checkout');
  expect(rows).toHaveLength(2);
});
