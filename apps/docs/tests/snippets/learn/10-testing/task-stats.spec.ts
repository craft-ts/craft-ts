// @vitest-environment jsdom
import {
  craftComputed,
  craftSignal,
  createYieldableReactiveValue,
  craftService,
  craftUse,
  setupCraftServiceTestingByRegister,
  state,
} from '@craft-ts/core';
import { describe, expect, it, vi } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

export const { TaskList } = craftService(
  { name: 'TaskList', providedIn: 'function' },
  function* () {
    yield* state('tasks', [] as Task[]);
  },
);

// #region task-stats
export const { TaskStats, provideTaskStats } = craftService(
  { name: 'TaskStats', providedIn: 'toProvide' },
  function* () {
    yield* craftComputed('done', function* () {
      return (yield* TaskList.tasks()).filter((task) => task.done).length;
    });
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
        // a reactive member is mocked by a reactive value, like the real one
        tasks: createYieldableReactiveValue(
          craftSignal<Task[]>([
            { id: '1', title: 'a', done: true },
            { id: '2', title: 'b', done: false },
          ]),
          'tasks',
        ),
      },
    });

    expect(craftUse(sut.done())).toBe(1);
    expect(mocks.TaskList).toBeDefined();
    // #endregion task-stats-test
  });
});
