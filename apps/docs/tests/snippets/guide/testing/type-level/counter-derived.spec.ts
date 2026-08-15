// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region counter-derived
import { button, craftComponent } from '@craft-ng/component';
import { craftComputed, state } from '@craft-ng/core';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const counter = yield* state('counter', 0, ({ state }) => ({
      disabled: craftComputed(function* () {
        return (yield* state()) % 2 === 0;
      }),
    }));

    return { counter };
  },
  (context) =>
    button(
      {
        type: 'button',
        disabled: context.counter.disabled,
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
