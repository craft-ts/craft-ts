// @vitest-environment jsdom
import {
  setupCraftComponentLogicTest,
  setupCraftComponentTemplateTest,
} from '@craft-ts/component/testing';
import { craftService, state } from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

const { TaskList } = craftService(
  { name: 'TaskList', providedIn: 'function' },
  function* () {
    const tasks = yield* state('tasks', [] as Task[], ({ update: _update }) => ({
      remaining: () => 0,
      add: (_title: string) => undefined,
      toggle: (_id: string) => undefined,
      remove: (_id: string) => undefined,
    }));
    return tasks;
  },
);

// #region tasks-component
import { craftComponent, each, h1, li, ul } from '@craft-ts/component';

export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* TaskList();
    return { tasks };
  },
  ({ tasks }) => [
    h1(function* () {
      return `Tasks — ${yield* tasks.remaining()} left`;
    }),
    ul(
      each(
        tasks,
        { track: (task) => task.id },
        (task) => li(task.title),
      ),
    ),
  ],
);
// #endregion tasks-component

describe('Learn 10 Tasks component', () => {
  it('tests the factory without the DOM', async () => {
    // #region tasks-logic-test
    const { context, mocks, destroy } =
      await setupCraftComponentLogicTest.byRegister(Tasks, {
        register: {
          TaskList: {
            $self: () => [{ id: '1', title: 'a', done: false }],
            remaining: () => 1,
          },
        },
      });

    expect(context.tasks.remaining()).toBe(1);
    destroy();
    // #endregion tasks-logic-test
    expect(mocks.TaskList).toBeDefined();
  });

  it('renders the template from a provided context', async () => {
    // #region tasks-template-test
    const test = await setupCraftComponentTemplateTest.byRegister(Tasks, {
      context: {
        tasks: Object.assign(
          function* () {
            return [{ id: '1', title: 'Write tests', done: false }];
          },
          {
            remaining: function* () {
              return 1;
            },
            add: () => undefined,
            toggle: () => undefined,
            remove: () => undefined,
          },
        ),
      },
      register: {},
    });

    expect(test.nativeElement.textContent).toContain('Tasks — 1 left');
    test.destroy();
    // #endregion tasks-template-test
  });
});
