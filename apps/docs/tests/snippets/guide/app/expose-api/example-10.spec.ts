// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-10
import { craftExpose, craftService, state } from '@craft-ts/core';

const { Counter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    }));
    yield* craftExpose('increment', counter.increment);
    yield* craftExpose('decrement', counter.decrement);
  },
);

const { CounterExtended, provideCounterExtended } = craftService(
  { name: 'CounterExtended', providedIn: 'toProvide' },
  function* () {
    // Only `counter` and `incrementCounter` reach this service: `decrement`
    // is neither usable here nor part of the dependency.
    const { counter, incrementCounter } = yield* Counter(
      undefined,
      ({ counter, increment }) => ({ counter, incrementCounter: increment }),
    );
    yield* craftExpose('count', counter);
    yield* craftExpose('increment', incrementCounter);
  },
);
// #endregion example-10

describe('guide/app/expose-api.md #example-10', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
