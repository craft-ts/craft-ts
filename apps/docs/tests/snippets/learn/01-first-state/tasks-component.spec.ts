// @vitest-environment jsdom
import { TestBed } from '@craft-ng/core';
import { setupCraftComponentLogicTest } from '@craft-ng/component';
import { craftUse } from '@craft-ng/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// #region tasks-component
import { craftComponent, each, h1, li, ul } from '@craft-ng/component';
import { state } from '@craft-ng/core';

type Task = { id: string; title: string; done: boolean };

export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* state('tasks', [ // read yield* as "I need"
      { id: '1', title: 'Read step 1', done: false },
    ] as Task[]);

    return { tasks };
  },
  ({ tasks }) => [
    h1('Tasks'),
    ul(each(tasks, { track: (task) => task.id }, (task) => li(task.title))),
  ],
);
// #endregion tasks-component

beforeAll(() => {
});

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('Learn 01 Tasks snippet', () => {
  it('exposes the seeded task list', async () => {
    const { context, destroy } = await setupCraftComponentLogicTest(Tasks, {
      register: {},
    });

    try {
      expect(craftUse(context.tasks())).toEqual([
        { id: '1', title: 'Read step 1', done: false },
      ]);
    } finally {
      destroy();
    }
  });
});
