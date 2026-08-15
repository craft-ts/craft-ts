// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-3
import { craftService, state } from '@craft-ng/core';

const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    }));
    return counter;
  },
);

const { CounterConsumer } = craftService(
  { name: 'CounterConsumer', scope: 'global' },
  function* () {
    const counter = yield* Counter();
    yield* counter.increment();
    return counter;
  },
);
// #endregion example-3

describe('guide/app/craft-service.md #example-3', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
