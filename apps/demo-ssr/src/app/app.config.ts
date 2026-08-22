import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideCraftDevTools,
  provideCraftRouter,
} from '@craft-ts/core';
import { App } from './app';
import { ssrRoutes } from './app.routes';

const developmentProviders = import.meta.env.DEV ? provideCraftDevTools() : [];

const ssrAppConfigDefinition = {
  routingDeps: ssrRoutes.META_PATHS,
  providers: [
    ...developmentProviders,
    provideCraftRootComponent(App),
    provideCraftRouter(ssrRoutes.toRoutes()),
  ],
} as const;

export function createSsrAppConfig() {
  return craftAppConfig(ssrAppConfigDefinition);
}

// Keep the exported config as a direct craftAppConfig call, like demo, so its
// route/provider metadata is inferred at the application boundary.
export const appConfig = craftAppConfig(ssrAppConfigDefinition);
