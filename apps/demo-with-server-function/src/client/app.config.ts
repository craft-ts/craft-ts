import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideAppInitializer,
  provideCraftRouter,
  provideDefaultServerFunctionTransport,
} from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { AppShell } from './app-shell';
import { appRoutes } from './app.routes';
import { ClientCurrentUserLive } from './authenticated-user';

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_PATHS,
  providers: [
    provideCraftRootComponent(AppShell),
    provideCraftRouter(appRoutes.toRoutes()),
    provideDefaultServerFunctionTransport(),
    provideLayer(ClientCurrentUserLive),
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});
