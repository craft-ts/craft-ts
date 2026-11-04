// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-1
import { craftService, craftExpose, craftMethod } from '@craft-ts/core';

const { UsersApi } = craftService(
  { name: 'UsersApi', providedIn: 'global' },
  function* () {
    yield* craftExpose('updateUser', (user: { id: string; name: string }) => Promise.resolve(user));
    yield* craftExpose('getUsers', () => Promise.resolve([]));
  },
);

const { UserUpdater } = craftService(
  { name: 'UserUpdater', providedIn: 'global' },
  function* () {
    yield* craftMethod('rename', function* (user: { id: string; name: string }, name: string) {
      // A method's shortcut calls it: only `updateUser` is recorded as used.
      return yield* UsersApi.updateUser({ ...user, name });
    });
  },
);
// #endregion example-1

describe('guide/app/expose-api.md #example-1', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
