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
      rule: 'runtime-entity-names-unique',
      target: '*',
      reason:
        'The demo is a gallery of isolated routed examples. Several examples intentionally use the same local primitive names, and only one route is mounted at a time; the route and lazy-loading checks cover that runtime boundary.',
    },
  ],
);
