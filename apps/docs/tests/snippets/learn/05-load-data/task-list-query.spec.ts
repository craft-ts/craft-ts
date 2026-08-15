// @vitest-environment jsdom
import { setupCraftServiceTestingByRegister } from '@craft-ng/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

// #region task-list-query
import { CraftHttpClient, craftService, query } from '@craft-ng/core';

export const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    const tasksQuery = yield* query('tasksQuery', {
      // The initial params value immediately triggers the loader.
      params: () => ({ done: false }),
      loader: function* ({ params }) {
        return yield* CraftHttpClient.get(({ response }) => ({
          url: `/api/tasks?done=${params.done}`,
          success: response<Task[]>(),
        }));
      },
    });

    return tasksQuery;
  },
);
// #endregion task-list-query

describe('Learn 05 TaskList query', () => {
  it('exposes a named query service', async () => {
    const { sut } = await setupCraftServiceTestingByRegister(TaskList, {
      TaskList: 'real',
      CraftHttpClient: {
        get: () => [],
      },
    });

    expect(sut).toBeDefined();
    expect(typeof sut.isLoading).toBe('function');
  });
});
