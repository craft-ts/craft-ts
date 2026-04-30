import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { withComponentInputBinding } from '@angular/router';
import { craftAppConfig } from '@craft-ng/core';
import { appRoutes } from './app.routes';
import './run-on-app-start/run-on-app-start';
import { provideCraftRouter } from './shared/router.service';

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_DATA,
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCraftRouter(appRoutes.toRoutes(), withComponentInputBinding()),
  ],
});
