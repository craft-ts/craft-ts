import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideAppInitializer,
  provideCraftRouter,
} from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { App } from './app';
import { demoEffectRoutes } from './app.routes';
import { AccessPolicyLive, SessionLive } from './shared/access-domain';

export const appConfig = craftAppConfig({
  routingDeps: demoEffectRoutes.META_PATHS,
  providers: [
    provideCraftRootComponent(App),
    provideCraftRouter(demoEffectRoutes.toRoutes()),
    // These are mocked application capabilities used by the business Effects.
    provideLayer(AccessPolicyLive),
    provideLayer(SessionLive),
    // Effect support is an application capability, not a concern of each
    // loader. Install it once for the dedicated Effect demo.
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});
