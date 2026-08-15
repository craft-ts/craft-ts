// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region counter-nested
import { craftComputed, state } from '@craft-ng/core';
import { button, craftComponent, div } from '@craft-ng/component';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const counter = yield* state('counter', 0, ({ state, update }) => ({
      disabled: craftComputed(function* () {
        return (yield* state()) === 0;
      }),
      increment: () => update((value) => value + 1),
    }));

    return { counter };
  },
  ({ counter }) =>
    div(
      { class: 'counter' },
      button('increment',
        {
          type: 'button',
          disabled: counter.disabled,
          *click(_event: MouseEvent) {
            yield* counter.increment();
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
