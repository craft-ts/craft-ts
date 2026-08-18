// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-10
import { craftService, state } from '@craft-ts/core';

const { Counter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    }));
    return counter;
  },
);

const { CounterExtended, provideCounterExtended } = craftService(
  { name: 'CounterExtended', providedIn: 'toProvide' },
  function* () {
    return yield* Counter(undefined, ({ $self, increment }) => ({
      $self,
      incrementCounter: increment,
    }));
  },
);
// #endregion example-10

describe('guide/app/expose-api.md #example-10', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
