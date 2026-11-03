import { craftMethod, craftService, state } from '@craft-ts/core';

/** Every rule at once: the filter's resting state. */
export const ALL_BYPASS_RULES = '*all*';

/**
 * The rule the bypasses view shows. Held here, not in the view: a `state` in a
 * component body is created again each time that body runs, and the choice
 * went back to every rule as soon as the list redrew.
 */
export const { BypassRuleFilter } = craftService(
  { name: 'BypassRuleFilter', providedIn: 'global' },
  function* () {
    const bypassRule = yield* state(
      'bypassRule',
      ALL_BYPASS_RULES,
      ({ set }) => ({ choose: (rule: string) => set(rule) }),
    );
    yield* craftMethod('chooseRule', function* (rule: string) {
      yield* bypassRule.choose(rule);
    });
  },
);
