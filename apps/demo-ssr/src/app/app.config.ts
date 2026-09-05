import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideCraftDevTools,
  provideDefaultServerFunctionTransport,
  provideCraftRouter,
  provideServerFunctionTransport,
  type Server,
} from '@craft-ts/core';
import { App } from './app';
import { ssrRoutes } from './app.routes';

const developmentProviders = import.meta.env.DEV ? provideCraftDevTools() : [];

const commonAppConfigDefinition = {
  providers: [
    ...developmentProviders,
    provideCraftRootComponent(App),
    provideCraftRouter(ssrRoutes.toRoutes()),
  ],
};

/**
 * Creates an isolated SSR configuration for one request.
 *
 * The browser facade stays unchanged, but its transport is replaced by a
 * direct registry invocation while renderCraft is running on the server.
 */
export function createSsrAppConfig(application: Pick<Server, 'invoke'>) {
  return craftAppConfig({
    ...commonAppConfigDefinition,
    providers: [
      ...commonAppConfigDefinition.providers,
      provideServerFunctionTransport((request) =>
        application.invoke(request.id, request.input, request.context),
      ),
    ],
  });
}

/** Browser entry point: server functions use their normal HTTP transport. */
export const appConfig = craftAppConfig({
  ...commonAppConfigDefinition,
  providers: [
    ...commonAppConfigDefinition.providers,
    provideDefaultServerFunctionTransport(),
  ],
});
