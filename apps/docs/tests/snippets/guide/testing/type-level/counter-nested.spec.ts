// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region counter-nested
import { craftComputed, craftService, state, craftUse } from '@craft-ts/core';
import { button, craftComponent, div } from '@craft-ts/component';

const { CounterView, provideCounterView } = craftService(
  { name: 'counterView', providedIn: 'toProvide' },
  function* () {
    yield* state('counter', 0, ({ state, update }) => ({
      disabled: craftUse(
        craftComputed('disabled', function* () {
          return (yield* state()) === 0;
        }),
      ),
      increment: () => update((value) => value + 1),
    }));
  },
);

const Counter = craftComponent(
  'Counter',
  { providers: [provideCounterView()] },
  () =>
    div(
      button(
        'increment',
        {
          type: 'button',
          disabled: function* () {
            return yield* (yield* CounterView()).counter.disabled();
          },
          *click(_event: MouseEvent) {
            yield* (yield* CounterView()).counter.increment();
          },
        },
        '+',
      ),
    ),
);
// #endregion counter-nested

describe('guide/testing/type-level.md #counter-nested', () => {
  it('loads the documented snippet', () => {
    expect(Counter).toEqual(expect.any(Function));
  });
});
