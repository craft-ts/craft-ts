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
      rule: 'no-unused-primitive-methods',
      target: '*',
      reason:
        'Not a style finding: state:collapsedFolders.collapseSide is unused in folder-layout-view.ts. rules/no-unused-primitive-method.spec.ts keeps failing on it until it is fixed.',
    },
  ],
);
