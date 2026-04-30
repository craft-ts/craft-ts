import { craftService, onAppStart } from '@craft-ng/core';

export const { injectAppStartLog } = craftService(
  {
    name: 'AppStartLog',
    scope: 'toProvide',
    appStart: true,
  },
  function* () {
    yield* onAppStart(async () => {
      console.log('App has started!');
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
