// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-6
import { craftService, source, state } from '@craft-ng/core';

const { Reset } = craftService(
  { name: 'Reset', scope: 'global' },
  function* () {
    const reset$ = yield* source$<void>('reset$');
    return reset$;
  },
);

const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  function* () {
    const counter = yield* state('counter', 0, ({ set }) => ({
      reset: on$(Reset, () => set(0)),
    }));

    const reset = yield* Reset();
    return { counter, reset };
  },
);
// #endregion example-6

describe('guide/reactivity/source.md #example-6', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
