import { Console, craftService, craftSleep, onAppStart } from '@craft-ng/core';

export const { AppStartLog, APP_START_LOG_META_DATA } = craftService(
  {
    name: 'AppStartLog',
    scope: 'toProvide',
    appStart: true,
  },
  function* () {
    yield* onAppStart(function* () {
      yield* Console.log('This is a log from the appStart callback');
      yield* craftSleep(1000);
    });
    return 1;
  },
);

declare module '@craft-ng/core' {
  interface CraftAppStartRegistry {
    AppStartLog: typeof AppStartLog;
  }
}
