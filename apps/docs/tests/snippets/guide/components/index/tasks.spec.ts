// @vitest-environment jsdom
import { TestBed } from '@craft-ts/core';
import { setupCraftComponentTemplateTest } from '@craft-ts/component';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// #region tasks
import { craftComponent, forNode, h1, li, ul } from '@craft-ts/component';
import { state } from '@craft-ts/core';

type Task = { id: string; title: string; done: boolean };

export const Tasks = craftComponent('Tasks', {}, function* () {
  const tasks = yield* state('tasks', [] as Task[]);

  return [
    h1('Tasks'),
    ul(
      forNode(tasks, { track: (task) => task.id }, (task) =>
        li(function* () {
          return (yield* task()).title;
        }),
      ),
    ),
  ];
});
// #endregion tasks

beforeAll(() => {});

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('guide/components/index.md #tasks', () => {
  it('renders the heading and an empty list', async () => {
    const template = await setupCraftComponentTemplateTest(Tasks, {
      inputs: {},
      register: {},
    });

    try {
      expect(template.nativeElement.querySelector('h1')?.textContent).toBe(
        'Tasks',
      );
      expect(template.nativeElement.querySelectorAll('li')).toHaveLength(0);
    } finally {
      template.destroy();
    }
  });
});
