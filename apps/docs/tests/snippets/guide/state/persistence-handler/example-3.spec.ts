// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-3
import { GlobalPersisterHandlerService, craftService } from '@craft-ng/core';

const { AccountSwitcher } = craftService(
  { name: 'AccountSwitcher', scope: 'toProvide' },
  function* () {
    const persister = yield* GlobalPersisterHandlerService();
    return {
      switchAccount: (accountId: string) => {
        persister.clearAllCache();
        // Load the selected account...
        return accountId;
      },
    };
  },
);
// #endregion example-3

describe('guide/state/persistence-handler.md #example-3', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
