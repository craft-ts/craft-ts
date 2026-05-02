import { Console, craftService, onAppStart } from '@craft-ng/core';

export const { injectAppStartLog, APP_START_LOG_META_DATA } = craftService(
  {
    name: 'AppStartLog',
    scope: 'toProvide',
    appStart: true,
  },
  function* () {
    yield* onAppStart(function* () {
      yield* Console.log('This is a log from the appStart callback');
      return new Promise((resolve) => setTimeout(resolve, 1000));
    });
    return 1;
  },
);

declare module '@craft-ng/core' {
  interface CraftAppStartRegistry {
    AppStartLog: typeof injectAppStartLog;
  }
}
