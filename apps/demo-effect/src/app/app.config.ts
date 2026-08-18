import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideAppInitializer,
  provideCraftRouter,
  type AppProvidedDependencyValuesOf,
} from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { Layer } from 'effect';
import { App } from './app';
import { demoEffectRoutes } from './app.routes';
import { AccessPolicyLive, SessionLive } from './shared/access-domain';

export const appConfig = craftAppConfig({
  routingDeps: demoEffectRoutes.META_PATHS,
  providers: [
    provideCraftRootComponent(App),
    provideCraftRouter(demoEffectRoutes.toRoutes()),
    // These are mocked application capabilities used by the business Effects.
    // A single provideLayer() per level: it stores its built context under one
    // DI token, so a second call at the same level would silently replace
    // this one instead of merging with it.
    provideLayer(Layer.mergeAll(AccessPolicyLive, SessionLive)),
    // Effect support is an application capability, not a concern of each
    // loader. Install it once for the dedicated Effect demo.
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});

/**
 * The union of Effect services (and other typed provider outputs) installed
 * at the app level — `provideLayer(...)`'s `ROut`s among them. Feeds
 * `EffectRequirementsCheckedDI` in each routed component's file so a removed
 * `provideLayer(...)` fails the build instead of the DI gap surfacing only at
 * runtime.
 */
export type AppProvidedEffectServices = AppProvidedDependencyValuesOf<
  typeof appConfig
>;
