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
      rule: 'style-only-design-system',
      target: '*',
      reason:
        'TODO(style-only): not migrated to @craft-ts/style yet (lot 5 of the style-only plan); the migration removes this waiver.',
    },
    {
      rule: 'no-global-stylesheet',
      target: 'file:libs/review-attestation/attestation-app/src/main.ts',
      reason:
        'TODO(style-only): not migrated to @craft-ts/style yet (lot 5 of the style-only plan); the migration removes this waiver.',
    },
    {
      rule: 'no-unused-primitive-methods',
      target: '*',
      reason:
        'Not a style finding: state:collapsedFolders.collapseSide is unused in folder-layout-view.ts. rules/no-unused-primitive-method.spec.ts keeps failing on it until it is fixed.',
    },
  ],
);
