// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region appconfig
import { Console, craftAppConfig, craftService, onAppStart } from '@craft-ts/core';

const { AppStartLog } = craftService(
  {
    name: 'AppStartLog',
    scope: 'global',
    appStart: true,
  },
  function* () {
    yield* onAppStart(function* () {
      yield* Console.log('startup log');
      return Promise.resolve();
    });

    return true;
  },
);

declare module '@craft-ts/core' {
  interface CraftAppStartRegistry {
    AppStartLog: typeof AppStartLog;
  }
}

export const appConfig = craftAppConfig({
  appStart: { AppStartLog },
});
// #endregion appconfig

describe('guide/app/app-start.md #appconfig', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
