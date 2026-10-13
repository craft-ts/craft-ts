// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-10
import { craftComputed, craftService, state } from '@craft-ts/core';

const { Counter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    }));
  },
);

const { CounterExtended, provideCounterExtended } = craftService(
  { name: 'CounterExtended', providedIn: 'toProvide' },
  function* () {
    // Only `counter` reaches this service; `decrement` is not part of the
    // dependency, while the nested increment method remains available.
    const { counter } = yield* Counter(
      undefined,
      ({ counter }) => ({ counter }),
    );
    yield* craftComputed('count', function* () {
      return yield* counter();
    });
    yield* Counter.counter.increment();
  },
);
void CounterExtended;
void provideCounterExtended;
// #endregion example-10

describe('guide/app/expose-api.md #example-10', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
