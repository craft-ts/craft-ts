// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region startupflag
import { craftService, onAppStart } from '@craft-ng/core';

export const { StartupFlag } = craftService(
  {
    name: 'StartupFlag',
    scope: 'global',
    appStart: true,
  },
  function* () {
    yield* onAppStart(() => {
      console.log('app started');
      return Promise.resolve();
    });

    return true;
  },
);
// #endregion startupflag

describe('guide/app/app-start.md #startupflag', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
