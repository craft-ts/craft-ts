import { provideCraftRootComponent } from '@craft-ts/component';
import { craftAppConfig, provideCraftRouter, provideDefaultServerFunctionTransport, provideCraftDevTools } from '@craft-ts/core';
import { AppShell } from './app-shell';
import { appRoutes } from './app.routes';

export const appConfig = craftAppConfig({
  providers: [
    ...(import.meta.env.DEV ? provideCraftDevTools() : []),
    provideCraftRootComponent(AppShell),
    provideCraftRouter(appRoutes.toRoutes()),
    provideDefaultServerFunctionTransport(),
  ],
});
