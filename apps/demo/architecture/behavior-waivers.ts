import { defineBehaviorWaivers } from '@craft-ts/dev-tools/behavior-catalog';
import { behaviorCatalog } from './behaviors.catalog';

/**
 * Behaviours left without a test on purpose, each with its reason:
 * `{ rule: 'behavior-unproven', target: '<id from behaviors.catalog.ts>', reason }`.
 *
 * A new behaviour arrives with its test or with an entry here. An entry whose
 * behaviour is gone fails the check: remove it with the code it excused.
 */
export const behaviorWaiverList = defineBehaviorWaivers(behaviorCatalog, [
  {
    rule: 'behavior-unproven',
    target: 'mutation:todoService.updateTodos#success',
    reason:
      'Draft service translated from a spec: no route mounts it, so no user can trigger it yet. Prove it with the page that will use it.',
  },
]);
