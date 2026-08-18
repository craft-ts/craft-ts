import { Console, craftService, onAppStart } from '@craft-ts/core';

export const { AppStartLog, APP_START_LOG_META_DATA } = craftService(
  {
    name: 'AppStartLog',
    providedIn: 'toProvide',
    appStart: true,
  },
  function* () {
    yield* onAppStart(function* () {
      yield* Console.log('This is a log from the appStart callback');
    });
    return 1;
  },
);

declare module '@craft-ts/core' {
  interface CraftAppStartRegistry {
    AppStartLog: typeof AppStartLog;
  }
}
