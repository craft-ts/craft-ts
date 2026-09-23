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
      rule: 'no-dangling-css-vars',
      target: 'css-var:--ds-surface',
      reason:
        'TODO(style-only): the design-system demo declares its page surface and never paints it; the lot 5 migration of the demo shell reads it.',
    },
    {
      rule: 'no-global-stylesheet',
      target: 'file:apps/demo/index.html',
      reason:
        'TODO(style-only): the Google Fonts link and the global stylesheet move to defineFont and craftGlobalStyles in the lot 5 migration.',
    },
    {
      rule: 'no-global-stylesheet',
      target: 'file:apps/demo/src/index.html',
      reason:
        'TODO(style-only): a second copy of the entry page carries the same Google Fonts link; the lot 5 migration removes it with the first.',
    },
  ],
);
