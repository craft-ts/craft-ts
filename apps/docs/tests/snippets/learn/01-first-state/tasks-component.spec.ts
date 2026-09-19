// @vitest-environment jsdom
import { TestBed } from '@craft-ts/core';
import { setupCraftComponentTemplateTest } from '@craft-ts/component';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// #region tasks-component
import { craftComponent, forNode, h1, li, ul } from '@craft-ts/component';
import { state } from '@craft-ts/core';

type Task = { id: string; title: string; done: boolean };

export const Tasks = craftComponent(
  'Tasks', // name: stable component name used by tooling and host tags
  {}, // meta: providers, styles and host configuration
  function* () {
    // one function: it declares what the component owns, then returns nodes
    const tasks = yield* state('tasks', [
      // name: state identifier
      { id: '1', title: 'Read step 1', done: false },
    ] as Task[]); // initial value: the seeded task list

    return [
      h1('Tasks'),
      ul(
        forNode(
          tasks, // source: the reactive collection to render
          { track: (task) => task.id }, // options: stable identity for each item
          // render: creates one node per task
          (task) =>
            li(function* () {
              return (yield* task()).title;
            }),
        ),
      ),
    ];
  },
);
// #endregion tasks-component

beforeAll(() => {});

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('Learn 01 Tasks snippet', () => {
  it('renders the seeded task list', async () => {
    const template = await setupCraftComponentTemplateTest(Tasks, {
      inputs: {},
      register: {},
    });

    try {
      expect(template.nativeElement.textContent).toContain('Read step 1');
    } finally {
      template.destroy();
    }
  });
});
