// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-1
import { craftService } from '@craft-ts/core';

const { UsersApi } = craftService(
  { name: 'UsersApi', providedIn: 'global' },
  () => ({
    updateUser: (user: { id: string; name: string }) => Promise.resolve(user),
    getUsers: () => Promise.resolve([]),
  }),
);

const { UserUpdater } = craftService(
  { name: 'UserUpdater', providedIn: 'global' },
  function* () {
    const updateUser = yield* UsersApi.updateUser();

    return {
      rename: (user: { id: string; name: string }, name: string) =>
        updateUser({ ...user, name }),
    };
  },
);
// #endregion example-1

describe('guide/app/expose-api.md #example-1', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
