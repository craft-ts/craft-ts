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
  ],
);
