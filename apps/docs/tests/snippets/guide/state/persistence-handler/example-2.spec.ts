// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-2
import { craftService, GlobalPersisterHandlerService } from '@craft-ts/core';

const { LogoutHandler } = craftService(
  { name: 'LogoutHandler', scope: 'toProvide' },
  function* () {
    const persister = yield* GlobalPersisterHandlerService();

    return {
      logout: () => persister.clearAllCache(),
    };
  },
);
// #endregion example-2

describe('guide/state/persistence-handler.md #example-2', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
