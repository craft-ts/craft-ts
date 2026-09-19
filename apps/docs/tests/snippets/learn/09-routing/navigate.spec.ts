// @vitest-environment jsdom
import { setupCraftComponentTemplateTest } from '@craft-ts/component';
import { describe, expect, it, vi } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region navigate
import { button, craftComponent } from '@craft-ts/component';
import { CraftRouter, craftMethod } from '@craft-ts/core';

export const TaskOpener = craftComponent('TaskOpener', {}, function* () {
  const router = yield* CraftRouter(undefined, ({ navigate }) => ({ navigate }));

  const goToTask = craftMethod('goToTask', function* (taskId: string) {
    void router.navigate({ to: 'tasks/:taskId', params: { taskId } });
  });

  return button('openTask', { type: 'button', click: () => goToTask('1') }, 'Open task 1');
});
// #endregion navigate

describe('Learn 09 CraftRouter navigate', () => {
  it('navigates to the task route when the button is clicked', async () => {
    const navigate = vi.fn();
    const template = await setupCraftComponentTemplateTest(TaskOpener, {
      inputs: {},
      register: { CraftRouter: { navigate } },
    });

    try {
      template.getByRole('button', { name: 'Open task 1' }).click();
      expect(navigate).toHaveBeenCalledWith({
        to: 'tasks/:taskId',
        params: { taskId: '1' },
      });
    } finally {
      template.destroy();
    }
  });
});
