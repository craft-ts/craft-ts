import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideAppInitializer,
  provideCraftRouter,
} from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { App } from './app';
import { demoEffectRoutes } from './app.routes';
import { GreetingServiceLive } from './shared/greeting-service';
import { GlobalLayer } from './shared/layer-scope-services';

export const appConfig = craftAppConfig({
  routingDeps: demoEffectRoutes.META_PATHS,
  providers: [
    provideCraftRootComponent(App),
    provideCraftRouter(demoEffectRoutes.toRoutes()),
    // The service contract and the domain Effect live in shared files. The
    // application Layer is the boundary that satisfies their R requirement.
    provideLayer(GreetingServiceLive),
    // This Layer is global; the /layer-scope route adds a second Layer locally.
    provideLayer(GlobalLayer),
    // Effect support is an application capability, not a concern of each
    // loader. Install it once for the dedicated Effect demo.
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});
