import { defineArchitectureWaivers } from '@craft-ts/dev-tools';
import { architectureCatalog } from './catalog';

/**
 * Deliberate bypasses of the architecture rules, each with its reason:
 * `{ rule, target, reason }`.
 *
 * Review Attest lists every entry for a decision. A waiver that no longer
 * waives anything fails the check: remove it when the code it excused is gone.
 */
export const architectureWaiverList = defineArchitectureWaivers(
  architectureCatalog,
  [
    {
      rule: 'runtime-entity-names-unique',
      target: '*',
      reason:
        'This routed dashboard defines multiple independent component-local hidden selectors. Each instance belongs to a separate view, so the repeated local name does not identify a shared runtime service or primitive.',
    },
    // Imports that point up the layers (ui → state → data-access → util).
    // Each one mixes two layers in one file; splitting the file removes it.
    {
      rule: 'folder-layout-layers',
      target:
        'file:apps/debug-session-dashboard/src/shared/util/replay-browser.ts',
      reason:
        'The browser adapter also builds the replay tiles with the dashboard classes. Splitting the adapter (util) from the tile rendering (ui) removes this import.',
    },
    {
      rule: 'folder-layout-layers',
      target:
        'file:apps/debug-session-dashboard/src/shared/util/replay-labels.ts',
      reason:
        'Most labels read replay state signals: they are derived state. Turning them into craftComputed values, or passing the values in, removes this import.',
    },
    {
      rule: 'folder-layout-layers',
      target:
        'file:apps/debug-session-dashboard/src/shared/util/replay-worker.ts',
      reason:
        'The worker surface reads the replay state to answer the thumbnail worker. Declaring it as a Craft service makes it state, where that read belongs.',
    },
    {
      rule: 'folder-layout-layers',
      target:
        'file:apps/debug-session-dashboard/src/features/e2e-replay/e2e-replay-route.service.ts',
      reason:
        'The route service both fetches the e2e recording and drives the replay session. Moving the fetch to its own data-access file removes this import.',
    },
  ],
);
