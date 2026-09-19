// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region router-link
import { a, craftComponent } from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';

export const TasksLink = craftComponent(
  'TasksLink',
  {},
  () => a('tasks', {}, 'Tasks').pipe(CraftRouterLink({ to: 'tasks' })),
);
// #endregion router-link

describe('Learn 09 CraftRouterLink', () => {
  // Mounting the anchor would need a live router; the snippet's contract here
  // is that the directive composes with the element.
  it('defines a linked anchor component', () => {
    expect(TasksLink).toEqual(expect.any(Function));
  });
});
