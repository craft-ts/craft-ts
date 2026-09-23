import { defineArchitectureWaivers } from '@craft-ts/dev-tools/architecture-graph';
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
      target: 'file:apps/demo-effect/src/main.ts',
      reason:
        'TODO(style-only): not migrated to @craft-ts/style yet (lot 5 of the style-only plan); the migration removes this waiver.',
    },
    {
      rule: 'no-global-stylesheet',
      target: 'file:apps/demo-effect/index.html',
      reason:
        'TODO(style-only): the Google Fonts link and the global stylesheet move to defineFont and craftGlobalStyles in the lot 5 migration.',
    },
  ],
);
