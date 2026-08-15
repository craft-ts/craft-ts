// @vitest-environment jsdom
import { craftUse, craftService, setupCraftServiceTestingByRegister, state } from '@craft-ng/core';
import { describe, expect, it, vi } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

export const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    return yield* state('tasks', [] as Task[]);
  },
);

// #region task-stats
import { craftComputed, craftService, state } from '@craft-ng/core';

export const { TaskStats, provideTaskStats } = craftService(
  { name: 'TaskStats', scope: 'toProvide' },
  function* () {
    const tasks = yield* TaskList();

    return {
      done: craftComputed('done', function* () {
        return (yield* tasks()).filter((task) => task.done).length;
      }),
    };
  },
);
// #endregion task-stats

describe('Learn 10 TaskStats service', () => {
  it('counts done tasks from the mocked list', async () => {
    // #region task-stats-test
    const { sut, mocks } = await setupCraftServiceTestingByRegister(TaskStats, {
      // the SUT itself, mounted through its own provider
      TaskStats: provideTaskStats(),

      // its only dependency, replaced by a mock
      TaskList: {
        $self: vi.fn(function* () {
          return [
            { id: '1', title: 'a', done: true },
            { id: '2', title: 'b', done: false },
          ];
        }),
      },
    });

    expect(craftUse(sut.done())).toBe(1);
    expect(mocks.TaskList).toBeDefined();
    // #endregion task-stats-test
  });
});
