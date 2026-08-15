// @vitest-environment jsdom
import { setupCraftComponentLogicTest } from '@craft-ng/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region navigate
import { craftComponent } from '@craft-ng/component';
import { CraftRouter, craftMethod } from '@craft-ng/core';

export const TaskOpener = craftComponent(
  'TaskOpener',
  {},
  function* () {
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({ navigate }));

    const goToTask = craftMethod('goToTask', function* (taskId: string) {
      void router.navigate({ to: 'tasks/:taskId', params: { taskId } });
    });

    return { goToTask };
  },
  () => [],
);
// #endregion navigate

describe('Learn 09 CraftRouter navigate', () => {
  it('exposes a named goToTask method', async () => {
    const { context, destroy } = await setupCraftComponentLogicTest(TaskOpener, {
      register: {
        CraftRouter: {
          navigate: () => undefined,
        },
      },
    });

    try {
      expect(typeof context.goToTask).toBe('function');
    } finally {
      destroy();
    }
  });
});
