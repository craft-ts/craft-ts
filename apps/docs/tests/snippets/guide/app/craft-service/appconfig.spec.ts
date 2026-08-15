// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region appconfig
import { craftAppConfig } from '@craft-ng/core';

import { Console, craftService, onAppStart } from '@craft-ng/core';

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

// register the current service to the AppStartRegistry
// it is auto-generated when used with the craft-ng ESLint plugin
declare module '@craft-ng/core' {
  interface CraftAppStartRegistry {
    AppStartLog: typeof AppStartLog;
  }
}

// inside craftAppConfig
export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog,
  },
});
// #endregion appconfig

describe('guide/app/craft-service.md #appconfig', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
