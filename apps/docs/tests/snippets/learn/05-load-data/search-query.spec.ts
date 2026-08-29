// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

// #region search-query
import { CraftHttpClient, craftService, query } from '@craft-ts/core';

export const { TaskSearch } = craftService(
  { name: 'TaskSearch', providedIn: 'function' },
  function* () {
    const searchQuery = yield* query('searchQuery', {
      method: (term: string) => term,
      loader: function* ({ params: term }) {
        return yield* CraftHttpClient.get(({ response }) => ({
          url: `/api/tasks?q=${term}`,
          success: response<Task[]>(),
        }));
      },
    });

    return { searchQuery };
  },
);
// #endregion search-query

describe('Learn 05 search query', () => {
  it('defines the documented TaskSearch service', () => {
    expect(TaskSearch).toEqual(expect.any(Function));
  });
});
