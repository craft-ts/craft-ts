import type { CraftAppStartRegistry } from './craft-app-config';
import { craftService, onAppStart } from './craft-service';

export const appStartCalls: string[] = [];

const { AppStartCounter: AppStartCounterInternal } = craftService(
  {
    name: 'AppStartCounter',
    scope: 'toProvide',
    appStart: true,
  },
  function* () {
    yield* onAppStart(() => {
      appStartCalls.push('started');
      return undefined;
    });
    return 1;
  },
);

export const AppStartCounter = AppStartCounterInternal;

declare module './craft-app-config' {
  interface CraftAppStartRegistry {
    MustRunOnStart: typeof AppStartCounter;
  }
}

export const requiredAppStart = {
  MustRunOnStart: AppStartCounter,
} satisfies CraftAppStartRegistry;
