// @vitest-environment jsdom
import { TestBed } from '@angular/core/testing';
import { setupCraftComponentLogicTest } from '@craft-ng/component';
import { craftUse } from '@craft-ng/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initDocsAngularTestBed } from '../../../angular-test-bed';

// #region tasks
import { craftComponent, each, h1, li, ul } from '@craft-ng/component';
import { state } from '@craft-ng/core';

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
    ul(each(tasks, { track: (task) => task.id }, (task) => li(task.title))),
  ],
);
// #endregion tasks

beforeAll(() => {
  initDocsAngularTestBed();
});

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
