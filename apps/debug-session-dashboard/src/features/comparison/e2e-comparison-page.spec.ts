import { inject, it } from 'vitest';
import { openDashboard } from '../../../test/dashboard-page';

it('compares a run with the green references of its test', async () => {
  const { shown } = await openDashboard(
    `/compare?test=shop.checkout&project=chromium&run=${inject('archivedSessionId')}`,
  );
  await shown('e2e-comparison-page');
  // Measured against the one green reference the test keeps.
  await shown('e2e-comparison-json', '"baselineCount": 1');
});
