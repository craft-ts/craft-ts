// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-7
import { craftService, state, craftExpose } from '@craft-ts/core';

const { Counter } = craftService(
  { name: 'Counter', providedIn: 'global' },
  function* () {
    yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
  },
);

const { CounterFacade } = craftService(
  { name: 'CounterFacade', providedIn: 'global' },
  function* () {
    const counter = (yield* Counter()).counter;

    yield* craftExpose('read', function* () {
      return yield* counter();
    });
    yield* craftExpose('increment', function* () {
      return yield* counter.increment();
    });
  },
);
// #endregion example-7

describe('guide/app/craft-service.md #example-7', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
