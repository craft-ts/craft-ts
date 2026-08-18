// @vitest-environment jsdom
import { setupCraftServiceTestingByRegister } from '@craft-ts/core';
import { craftUse } from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

const newTask = (title: string): Task => ({
  id: crypto.randomUUID(),
  title,
  done: false,
});

// #region task-list
import { craftComputed, craftService, state } from '@craft-ts/core';

export const { TaskList } = craftService(
  { name: 'TaskList', providedIn: 'function' },
  function* () {
    const tasks = yield* state('tasks', [] as Task[], ({ state, update }) => ({
      add: (title: string) => update((current) => [...current, newTask(title)]),
      toggle: (id: string) =>
        update((current) =>
          current.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        ),
      remaining: craftComputed(function* () {
        return (yield* state()).filter((t) => !t.done).length;
      }),
    }));

    return tasks;
  },
);
// #endregion task-list

describe('Learn 03 TaskList service', () => {
  it('toggles a task and updates remaining', async () => {
    const { sut } = await setupCraftServiceTestingByRegister(TaskList, {
      TaskList: 'real',
    });

    sut.add('Move logic out');
    const id = craftUse(sut())[0]?.id;
    expect(id).toBeDefined();
    sut.toggle(id as string);
    expect(craftUse(sut.remaining())).toBe(0);
  });
});
