// @vitest-environment jsdom
import {
  craftUse,
  setupCraftServiceTestingByRegister,
  craftPrivate,
  craftExpose,
} from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region search-facade
import { craftService, state } from '@craft-ts/core';

const { SearchApi } = craftService(
  { name: 'SearchApi', providedIn: 'global' },
  function* () {
    const isLoading = yield* craftPrivate(state('isLoading', false));
    const data = yield* craftPrivate(state('data', [] as string[]));
    yield* craftExpose('usersQuery', {
      isLoading,
      data,
    });
  },
);

const { SearchFacade } = craftService(
  { name: 'SearchFacade', providedIn: 'global' },
  function* () {
    yield* SearchApi.usersQuery.isLoading();
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
