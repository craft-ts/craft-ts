// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-6
import { craftService, on$, source$, state, craftExpose } from '@craft-ts/core';

const { Reset } = craftService(
  { name: 'Reset', providedIn: 'global' },
  function* () {
    const reset$ = yield* source$<void>('reset$');
  },
);

const { Counter } = craftService(
  { name: 'Counter', providedIn: 'global' },
  function* () {
    const counter = yield* state('counter', 0, ({ set }) => ({
      reset: on$(Reset, () => set(0)),
    }));

    const reset = (yield* Reset()).reset$;
    yield* craftExpose('reset', reset);
  },
);
// #endregion example-6

describe('guide/reactivity/source.md #example-6', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
