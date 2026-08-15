// @vitest-environment jsdom
import { setupCraftServiceTestingByRegister } from '@craft-ng/core';
import { craftUse } from '@craft-ng/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

const newTask = (title: string): Task => ({
  id: crypto.randomUUID(),
  title,
  done: false,
});

// #region insert-state-pipe
import { insertStatePipe, craftComputed, craftService, state } from '@craft-ng/core';

export const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    const tasks = yield* state(
      'tasks',
      [] as Task[],
      insertStatePipe(
        ({ update }) => ({
          add: (title: string) => update((c) => [...c, newTask(title)]),
        }),
        ({ state }) => ({
          remaining: craftComputed(function* () {
            return (yield* state()).filter((t) => !t.done).length;
          }),
          isEmpty: craftComputed(function* () {
            return (yield* state()).length === 0;
          }),
        }),
      ),
    );

    return tasks;
  },
);
// #endregion insert-state-pipe

describe('Learn 02 insertStatePipe', () => {
  it('composes add and remaining insertions', async () => {
    const { sut } = await setupCraftServiceTestingByRegister(TaskList, {
      TaskList: 'real',
    });

    expect(craftUse(sut.isEmpty())).toBe(true);
    sut.add('Split insertions');
    expect(craftUse(sut.remaining())).toBe(1);
    expect(craftUse(sut.isEmpty())).toBe(false);
  });
});
