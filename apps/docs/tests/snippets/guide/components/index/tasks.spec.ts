// @vitest-environment jsdom
import { TestBed } from '@craft-ts/core';
import { setupCraftComponentLogicTest } from '@craft-ts/component';
import { craftUse } from '@craft-ts/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// #region tasks
import { craftComponent, forNode, h1, li, ul } from '@craft-ts/component';
import { state } from '@craft-ts/core';

type Task = { id: string; title: string; done: boolean };

export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* state('tasks', [] as Task[]);
    return { tasks };
  },
  ({ tasks }) => [
    h1('Tasks'),
    ul(
      forNode(tasks, { track: (task) => task.id }, (task) =>
        li(function* () {
          return (yield* task()).title;
        }),
      ),
    ),
  ],
);
// #endregion tasks

beforeAll(() => {});

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('guide/components/index.md #tasks', () => {
  it('exposes an empty task list', async () => {
    const { context, destroy } = await setupCraftComponentLogicTest(Tasks, {
      register: {},
    });

    try {
      expect(craftUse(context.tasks())).toEqual([]);
    } finally {
      destroy();
    }
  });
});
