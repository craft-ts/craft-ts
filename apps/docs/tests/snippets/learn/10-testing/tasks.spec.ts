// @vitest-environment jsdom
import { setupCraftComponentTemplateTest } from '@craft-ts/component/testing';
import {
  craftService,
  craftUse,
  markYieldableValue,
  setupCraftServiceTestingByRegister,
  state,
} from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

const { TaskList, provideTaskList } = craftService(
  { name: 'TaskList', providedIn: 'toProvide' },
  function* () {
    yield* state('tasks', [] as Task[], ({ update: _update }) => ({
      remaining: () => 0,
      add: (_title: string) => undefined,
      toggle: (_id: string) => undefined,
      remove: (_id: string) => undefined,
    }));
  },
);

// #region tasks-component
import { craftComponent, forNode, h1, li, ul } from '@craft-ts/component';

export const Tasks = craftComponent(
  'Tasks',
  { providers: [provideTaskList()] },
  () => [
    h1(function* () {
      return `Tasks — ${yield* (yield* TaskList()).tasks.remaining()} left`;
    }),
    ul(
      forNode(
        function* () {
          return yield* (yield* TaskList()).tasks();
        },
        { track: (task) => task.id },
        (task) =>
          li(function* () {
            return (yield* task()).title;
          }),
      ),
    ),
  ],
);
// #endregion tasks-component

describe('Learn 10 Tasks component', () => {
  it('tests the service without the DOM', async () => {
    // #region tasks-service-test
    const { sut } = await setupCraftServiceTestingByRegister(TaskList, {
      TaskList: provideTaskList(),
    });

    expect(craftUse(sut.tasks.remaining())).toBe(0);
    // #endregion tasks-service-test
  });

  it('renders the template against a mocked service', async () => {
    // #region tasks-template-test
    const test = await setupCraftComponentTemplateTest.byRegister(Tasks, {
      inputs: {},
      register: {
        TaskList: {
          // State reads are yieldable signals; preserve that contract in the
          // mock so the template can yield the list like it does in the app.
          tasks: markYieldableValue(
            Object.assign(
              function* () {
                return [{ id: '1', title: 'Write tests', done: false }];
              },
              {
                remaining: function* () {
                  return 1;
                },
              },
            ),
            'tasks',
          ),
        },
      },
    });

    expect(test.nativeElement.textContent).toContain('Tasks — 1 left');
    test.destroy();
    // #endregion tasks-template-test
  });
});
