import { it } from 'vitest';
import { openDashboard } from '../../../test/dashboard-page';

it('opens the replay surface for a file to import, with no archived session', async () => {
  const { shown } = await openDashboard('/import');
  await shown('detail-page', 'Session importée');
  // Nothing imported yet: nothing to play.
  await shown('replay-progress', 'Aucune étape rejouable');
});
