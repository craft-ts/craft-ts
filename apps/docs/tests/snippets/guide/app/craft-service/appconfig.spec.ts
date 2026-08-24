// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region appconfig
import { craftAppConfig } from '@craft-ts/core';

import { Console, craftService, onAppStart } from '@craft-ts/core';

const { AppStartLog } = craftService(
  {
    name: 'AppStartLog',
    providedIn: 'global',
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
// it is auto-generated when used with the craft-ts ESLint plugin
declare module '@craft-ts/core' {
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
