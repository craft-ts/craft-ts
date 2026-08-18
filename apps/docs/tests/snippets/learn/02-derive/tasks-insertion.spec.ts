// @vitest-environment jsdom
import { setupCraftServiceTestingByRegister } from '@craft-ts/core';
import { craftUse } from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region tasks-insertion
import { craftComputed, craftService, state } from '@craft-ts/core';

type Task = { id: string; title: string; done: boolean };

export const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    const tasks = yield* state('tasks', [] as Task[], ({ state, set, update }) => ({
      add: (title: string) =>
        update((current) => [
          ...current,
          { id: crypto.randomUUID(), title, done: false },
        ]),

      toggle: (id: string) =>
        update((current) =>
          current.map((task) =>
            task.id === id ? { ...task, done: !task.done } : task,
          ),
        ),

      remove: function* (id: string) {
        const current = yield* state();
        return yield* set(current.filter((task) => task.id !== id));
      },

      remaining: craftComputed(function* () {
        return (yield* state()).filter((task) => !task.done).length;
      }),
    }));

    return tasks;
  },
);
// #endregion tasks-insertion

describe('Learn 02 tasks insertion', () => {
  it('adds a task through the insertion', async () => {
    const { sut } = await setupCraftServiceTestingByRegister(TaskList, {
      TaskList: 'real',
    });

    expect(craftUse(sut())).toEqual([]);
    sut.add('Learn insertions');
    expect(craftUse(sut())).toEqual([
      expect.objectContaining({ title: 'Learn insertions', done: false }),
    ]);
    expect(craftUse(sut.remaining())).toBe(1);
  });
});
