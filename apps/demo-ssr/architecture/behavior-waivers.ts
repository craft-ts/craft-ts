import { defineBehaviorWaivers } from '@craft-ts/dev-tools';
import { behaviorCatalog } from './behaviors.catalog';

/**
 * Behaviours left without a test on purpose, each with its reason:
 * `{ rule: 'behavior-unproven', target: '<id from behaviors.catalog.ts>', reason }`.
 *
 * A new behaviour arrives with its test or with an entry here. An entry whose
 * behaviour is gone fails the check: remove it with the code it excused.
 */
export const behaviorWaiverList = defineBehaviorWaivers(behaviorCatalog, []);
