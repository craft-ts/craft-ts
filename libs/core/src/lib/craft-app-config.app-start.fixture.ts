import type { CraftAppStartRegistry } from './craft-app-config';
import { craftService, onAppStart } from './craft-service';

export const appStartCalls: string[] = [];

export const { injectAppStartCounter } = craftService(
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

declare module './craft-app-config' {
  interface CraftAppStartRegistry {
    MustRunOnStart: typeof injectAppStartCounter;
  }
}

export const requiredAppStart = {
  MustRunOnStart: injectAppStartCounter,
} satisfies CraftAppStartRegistry;

export const requiredAppStartFlag = true as const;
