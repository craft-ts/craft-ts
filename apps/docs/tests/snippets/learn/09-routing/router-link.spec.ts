// @vitest-environment jsdom
import { setupCraftComponentLogicTest } from '@craft-ts/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region router-link
import { a, craftComponent } from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';

export const TasksLink = craftComponent(
  'TasksLink',
  {},
  () => ({}),
  () => a('tasks', { craftRouterLink: { to: 'tasks' } }, 'Tasks').pipe(CraftRouterLink),
);
// #endregion router-link

describe('Learn 09 CraftRouterLink', () => {
  it('defines a linked anchor component', async () => {
    const { destroy } = await setupCraftComponentLogicTest(TasksLink, {
      register: {},
    });
    destroy();
    expect(TasksLink).toEqual(expect.any(Function));
  });
});
