// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region query-params
import { craftService, queryParams } from '@craft-ng/core';

export const { TaskFilters } = craftService(
  { name: 'TaskFilters', scope: 'function' },
  function* () {
    const numberCodec = {
      decode: (value: string) => parseInt(value, 10),
      encode: (value: number) => String(value),
    };
    const booleanCodec = {
      decode: (value: string) => value === 'true',
      encode: (value: boolean) => String(value),
    };

    const filters = yield* queryParams(
      'filters',
      {
        state: {
          page: { fallbackValue: 1, codec: numberCodec },
          showDone: { fallbackValue: false, codec: booleanCodec },
        },
      },
      ({ set, patch, reset }) => ({ set, patch, reset }),
    );

    return filters;
  },
);
// #endregion query-params

describe('Learn 07 queryParams', () => {
  it('defines the documented TaskFilters service', () => {
    expect(TaskFilters).toEqual(expect.any(Function));
  });
});
