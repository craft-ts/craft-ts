// @vitest-environment jsdom
import {
  craftUse,
  setupCraftServiceTestingByRegister,
} from '@craft-ng/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region current-user
import { craftService, state } from '@craft-ng/core';

const { UsersApi } = craftService(
  { name: 'UsersApi', scope: 'global' },
  function* () {
    const currentUser = yield* state('currentUser', {
      id: '1',
      name: 'Ada',
    });
    return {
      updateUser: (user: { id: string; name: string }) =>
        Promise.resolve(user),
      currentUser,
    };
  },
);

const { CurrentUser } = craftService(
  { name: 'CurrentUser', scope: 'global' },
  function* () {
    return yield* UsersApi.currentUser();
  },
);
// #endregion current-user

describe('guide/app/expose-api.md #current-user', () => {
  it('tracks only the currentUser property shortcut', async () => {
    const { sut } = await setupCraftServiceTestingByRegister(CurrentUser, {
      CurrentUser: 'real',
      UsersApi: 'real',
    });

    expect(craftUse(sut())).toEqual({ id: '1', name: 'Ada' });
  });
});
