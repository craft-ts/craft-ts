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
import { provideClaimedUserId } from '../shared/claimed-user-id';
import { clientAuthenticatedUser, ClientCurrentUserLive } from './authenticated-user';

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_PATHS,
  providers: [
    provideCraftRootComponent(AppShell),
    provideCraftRouter(appRoutes.toRoutes()),
    provideDefaultServerFunctionTransport(),
    // Ce que le navigateur annonce de lui-même au serveur. Le serveur ne le
    // croit pas sur parole : il le revalide et le confronte à sa session.
    provideClaimedUserId(() => clientAuthenticatedUser.id),
    provideLayer(ClientCurrentUserLive),
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});
