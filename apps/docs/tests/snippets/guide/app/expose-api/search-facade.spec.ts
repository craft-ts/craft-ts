// @vitest-environment jsdom
import {
  craftUse,
  setupCraftServiceTestingByRegister,
} from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region search-facade
import { craftService, state } from '@craft-ts/core';

const { SearchApi } = craftService(
  { name: 'SearchApi', scope: 'global' },
  function* () {
    const isLoading = yield* state('isLoading', false);
    const data = yield* state('data', [] as string[]);
    return {
      usersQuery: {
        isLoading,
        data,
      },
    };
  },
);

const { SearchFacade } = craftService(
  { name: 'SearchFacade', scope: 'global' },
  function* () {
    const isLoading = yield* SearchApi.usersQuery.isLoading();
    return { isLoading };
  },
);
// #endregion search-facade

describe('guide/app/expose-api.md #search-facade', () => {
  it('tracks only the nested isLoading property', async () => {
    const { sut } = await setupCraftServiceTestingByRegister(SearchFacade, {
      SearchFacade: 'real',
      SearchApi: 'real',
    });

    expect(craftUse(sut.isLoading())).toBe(false);
  });
});
