// @vitest-environment jsdom
import { setupCraftComponentTemplateTest } from '@craft-ts/component/testing';
import {
  craftService,
  craftUse,
  setupCraftServiceTestingByRegister,
  state,
} from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

type Task = { id: string; title: string; done: boolean };

const { TaskList } = craftService(
  { name: 'TaskList', providedIn: 'function' },
  function* () {
    const tasks = yield* state(
      'tasks',
      [] as Task[],
      ({ update: _update }) => ({
        remaining: () => 0,
        add: (_title: string) => undefined,
        toggle: (_id: string) => undefined,
        remove: (_id: string) => undefined,
      }),
    );
    return tasks;
  },
);

// #region tasks-component
import { craftComponent, forNode, h1, li, ul } from '@craft-ts/component';

export const Tasks = craftComponent('Tasks', {}, function* () {
  const tasks = yield* TaskList();

  return [
    h1(function* () {
      return `Tasks — ${yield* tasks.remaining()} left`;
    }),
    ul(
      forNode(tasks, { track: (task) => task.id }, (task) =>
        li(function* () {
          return (yield* task()).title;
        }),
      ),
    ),
  ];
});
// #endregion tasks-component

describe('Learn 10 Tasks component', () => {
  it('tests the service without the DOM', async () => {
    // #region tasks-service-test
    const { sut } = await setupCraftServiceTestingByRegister(TaskList, {
      TaskList: 'real',
    });

    expect(craftUse(sut.remaining())).toBe(0);
    // #endregion tasks-service-test
  });

  it('renders the template against a mocked service', async () => {
    // #region tasks-template-test
    const test = await setupCraftComponentTemplateTest.byRegister(Tasks, {
      inputs: {},
      register: {
        TaskList: {
          $self: () => [{ id: '1', title: 'Write tests', done: false }],
          // A state method hands back an invocation, so the fake does too.
          remaining: function* () {
            return 1;
          },
        },
      },
    });

    expect(test.nativeElement.textContent).toContain('Tasks — 1 left');
    test.destroy();
    // #endregion tasks-template-test
  });
});
