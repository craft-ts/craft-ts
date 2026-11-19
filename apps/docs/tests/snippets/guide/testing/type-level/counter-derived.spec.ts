// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region counter-derived
import { button, craftComponent } from '@craft-ts/component';
import { craftComputed, craftService, state, craftUse } from '@craft-ts/core';

const { CounterView, provideCounterView } = craftService(
  { name: 'counterView', providedIn: 'toProvide' },
  function* () {
    yield* state('counter', 0, ({ state }) => ({
      disabled: craftUse(
        craftComputed('disabled', function* () {
          return (yield* state()) % 2 === 0;
        }),
      ),
    }));
  },
);

const Counter = craftComponent(
  'Counter',
  { providers: [provideCounterView()] },
  () =>
    button(
      'increment',
      {
        type: 'button',
        disabled: function* () {
          return yield* (yield* CounterView()).counter.disabled();
        },
      },
      '+',
    ),
);
// #endregion counter-derived

describe('guide/testing/type-level.md #counter-derived', () => {
  it('loads the documented snippet', () => {
    expect(Counter).toEqual(expect.any(Function));
  });
});
