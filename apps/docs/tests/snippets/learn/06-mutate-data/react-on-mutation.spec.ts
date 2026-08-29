// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

// #region react-on-mutation
import {
  CraftHttpClient,
  craftService,
  insertReactOnMutation,
  mutation,
  query,
} from '@craft-ts/core';

export const { TaskSync } = craftService(
  { name: 'TaskSync', providedIn: 'function' },
  function* () {
    const createTask = yield* mutation('createTask', {
      method: (payload: { title: string }) => payload,
      loader: function* ({ params }) {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/tasks',
          payload: params,
          success: response<Task>(),
        }));
      },
    });

    const tasksQuery = yield* query(
      'tasksQuery',
      {
        params: () => ({ done: false }),
        loader: function* () {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: '/api/tasks',
            success: response<Task[]>(),
          }));
        },
      },
      insertReactOnMutation(createTask, {
        reload: { onMutationResolved: true },
      }),
    );

    return { createTask, tasksQuery };
  },
);
// #endregion react-on-mutation

describe('Learn 06 insertReactOnMutation', () => {
  it('defines the documented TaskSync service', () => {
    expect(TaskSync).toEqual(expect.any(Function));
  });
});
