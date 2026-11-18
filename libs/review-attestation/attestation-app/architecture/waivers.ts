import { defineArchitectureWaivers } from '@craft-ts/dev-tools';
import { architectureCatalog } from './catalog';

/**
 * Deliberate bypasses of the architecture rules, each with its reason.
 *
 * Review Attest lists every entry for a decision. A waiver that no longer
 * waives anything fails the check: remove it when the code it excused is gone.
 */
export const architectureWaiverList = defineArchitectureWaivers(
  architectureCatalog,
  [
    {
      rule: 'source-trigger-ownership',
      target: 'primitive:ReviewAppModel.trackSelection',
      reason:
        'The frozen replay iframe is outside the Craft template tree. frame.onPick installs native click and drag listeners and invokes selectNodes, which calls trackSelection. These pointer events own mentionEdited$; setup and background work do not invoke this action.',
    },
  ],
);
