import { defineBehaviorWaivers } from '@craft-ts/dev-tools/behavior-catalog';
import { behaviorCatalog } from './behaviors.catalog';

/**
 * Behaviours left without a test on purpose, each with its reason:
 * `{ rule: 'behavior-unproven', target: '<id from behaviors.catalog.ts>', reason }`.
 *
 * A new behaviour arrives with its test or with an entry here. An entry whose
 * behaviour is gone fails the check: remove it with the code it excused.
 */
const TEMPLATE_TEST =
  'Template test of a documentation example: setupCraftComponentTemplateTest renders the template from the view it is given, which is what the example teaches.';

export const behaviorWaiverList = defineBehaviorWaivers(behaviorCatalog, [
  {
    rule: 'behavior-test-mocks-boundaries',
    target: 'apps/demo/src/app/examples/primitives/granular-mutation/granular-mutation.spec.ts:granularMutationView',
    reason: TEMPLATE_TEST,
  },
  {
    rule: 'behavior-test-mocks-boundaries',
    target: 'apps/demo/src/app/examples/primitives/list-with-pagination/list-with-pagination.spec.ts:listWithPaginationView',
    reason: TEMPLATE_TEST,
  },
  {
    rule: 'behavior-test-mocks-boundaries',
    target: 'apps/demo/src/app/examples/primitives/mutation/mutation.spec.ts:mutationDemoView',
    reason: TEMPLATE_TEST,
  },
]);
