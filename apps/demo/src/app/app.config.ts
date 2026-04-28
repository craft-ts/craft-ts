import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { craftAppConfig } from '@craft-ng/core';
import { appRoutes } from './app.routes';

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_DATA,
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes.toRoutes(), withComponentInputBinding()),
  ],
});
