// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-7
import { craftService, state } from '@craft-ng/core';

const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
    return counter;
  },
);

const { CounterFacade } = craftService(
  { name: 'CounterFacade', scope: 'global' },
  function* () {
    const counter = yield* Counter();

    return {
      read: function* () {
        return yield* counter();
      },
      increment: function* () {
        return yield* counter.increment();
      },
    };
  },
);
// #endregion example-7

describe('guide/app/craft-service.md #example-7', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
