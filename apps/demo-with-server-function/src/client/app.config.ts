import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideAppInitializer,
  provideDefaultServerFunctionTransport,
} from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { ClientCurrentUserLive } from './authenticated-user';
import { ServerFunctionDemo } from './server-function-demo';

export const appConfig = craftAppConfig({
  routingDeps: [],
  providers: [
    provideCraftRootComponent(ServerFunctionDemo),
    provideDefaultServerFunctionTransport(),
    provideLayer(ClientCurrentUserLive),
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});
