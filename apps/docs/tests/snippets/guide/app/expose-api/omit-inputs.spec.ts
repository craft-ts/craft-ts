// @vitest-environment jsdom
import {
  setupCraftServiceTestingByRegister,
  state,
  craftExpose,
  craftPrivate,
} from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region omit-inputs
import { craftService, type CraftServiceInput } from '@craft-ts/core';

const { Counter } = craftService(
  { name: 'Counter', providedIn: 'function' },
  function* (inputs: { initialValue?: CraftServiceInput<number> }) {
    const initialValue = inputs.initialValue
      ? yield* inputs.initialValue()
      : 0;
    yield* craftExpose('count', initialValue);
  },
);
// #endregion omit-inputs

const { CounterHost } = craftService(
  { name: 'CounterHost', providedIn: 'function' },
  function* () {
    const startAt = yield* craftPrivate(state('startAt', 5));
    const count = yield* Counter.count({ initialValue: startAt });
    const defaultCount = yield* Counter.OmitInputs.count();
    yield* craftExpose('count', count);
    yield* craftExpose('defaultCount', defaultCount);
  },
);

describe('guide/app/expose-api.md #omit-inputs', () => {
  it('reads bound inputs and OmitInputs defaults', async () => {
    const { sut } = await setupCraftServiceTestingByRegister(CounterHost, {
      CounterHost: 'real',
      Counter: 'real',
    });

    expect(sut.count).toBe(5);
    expect(sut.defaultCount).toBe(0);
  });
});
