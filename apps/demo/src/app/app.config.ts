import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { withComponentInputBinding } from '@angular/router';
import { craftAppConfig } from '@craft-ng/core';
import { demoRoutes } from './app.routes';
import { injectAppStartLog } from './run-on-app-start/run-on-app-start';
import { provideCraftRouter } from './shared/router.service';

export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog: injectAppStartLog,
  },
  routingDeps: demoRoutes.META_DATA,
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCraftRouter(demoRoutes.toRoutes(), withComponentInputBinding()),
  ],
});
