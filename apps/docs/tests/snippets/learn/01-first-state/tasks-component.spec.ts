// @vitest-environment jsdom
import { TestBed } from '@craft-ts/core';
import { setupCraftComponentLogicTest } from '@craft-ts/component';
import { craftUse } from '@craft-ts/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// #region tasks-component
import { craftComponent, forNode, h1, li, ul } from '@craft-ts/component';
import { state } from '@craft-ts/core';

type Task = { id: string; title: string; done: boolean };

export const Tasks = craftComponent(
  'Tasks', // name: stable component name used by tooling and host tags
  {}, // meta: providers, styles and host configuration
  function* () { // logic factory: creates the component context
    const tasks = yield* state('tasks', [ // name: state identifier
      { id: '1', title: 'Read step 1', done: false },
    ] as Task[]); // initial value: the seeded task list

    return { tasks };
  },
  ({ tasks }) => [ // template: turns the context into rendered nodes
    h1('Tasks'),
    ul(
      forNode(
        tasks, // source: the reactive collection to render
        { track: (task) => task.id }, // options: stable identity for each item
        (task) => li(task.title), // render: creates one node per task
      ),
    ),
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
