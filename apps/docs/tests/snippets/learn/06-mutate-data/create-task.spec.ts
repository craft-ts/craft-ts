// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

// #region create-task
import { CraftHttpClient, craftService, mutation } from '@craft-ts/core';

export const { TaskWrites } = craftService(
  { name: 'TaskWrites', providedIn: 'function' },
  function* () {
    const { createTask } =
      yield *
      mutation('createTask', {
        method: (payload: { title: string }) => payload,
        loader: function* ({ params }) {
          return yield* CraftHttpClient.post(({ response }) => ({
            url: '/api/tasks',
            body: params,
            success: response<Task>(),
          }));
        },
      });

    return { createTask };
  },
);
// #endregion create-task

describe('Learn 06 createTask mutation', () => {
  it('defines the documented TaskWrites service', () => {
    expect(TaskWrites).toEqual(expect.any(Function));
  });
});
