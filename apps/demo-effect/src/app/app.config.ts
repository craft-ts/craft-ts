import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideAppInitializer,
  provideCraftRouter,
} from '@craft-ts/core';
import { installCraftEffectBridge } from '@craft-ts/effect';
import { App } from './app';
import { demoEffectRoutes } from './app.routes';

export const appConfig = craftAppConfig({
  routingDeps: demoEffectRoutes.META_PATHS,
  providers: [
    provideCraftRootComponent(App),
    provideCraftRouter(demoEffectRoutes.toRoutes()),
    // Effect support is an application capability, not a concern of each
    // loader. Install it once for the dedicated Effect demo.
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});
