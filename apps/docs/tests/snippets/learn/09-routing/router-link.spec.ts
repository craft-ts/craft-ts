// @vitest-environment jsdom
import { setupCraftComponentLogicTest } from '@craft-ng/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region router-link
import { a, craftComponent } from '@craft-ng/component';
import { CraftRouterLink } from '@craft-ng/core';

export const TasksLink = craftComponent(
  'TasksLink',
  {},
  () => ({}),
  () => a({ craftRouterLink: { to: 'tasks' } }, 'Tasks').pipe(CraftRouterLink),
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
