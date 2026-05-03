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

type _LazyLayoutChildPath = 'craft/lazy-layout/:teamId/users/:userId';

type _LazyLayoutChildBeforeAppConfig = Extract<
  (typeof demoRoutes.META_DATA)[number],
  { path: _LazyLayoutChildPath }
>;

type _LazyLayoutChildAfterAppConfig = Extract<
  (typeof appConfig.APP_CONFIG_META_DATA)[number],
  { path: _LazyLayoutChildPath }
>;

type _MissingProviderProbe<RouteMeta> = RouteMeta extends {
  missingProvider: infer MissingProvider extends object;
}
  ? MissingProvider
  : {
      __missingProvider_not_exposed__: true;
    };

type _LazyLayoutChildMissingProviderProbe = {
  beforeAppConfig: _MissingProviderProbe<_LazyLayoutChildBeforeAppConfig>;
  afterAppConfig: _MissingProviderProbe<_LazyLayoutChildAfterAppConfig>;
  beforeHasDemoUserIdParams: 'DemoUserIdParams' extends keyof _MissingProviderProbe<_LazyLayoutChildBeforeAppConfig>
    ? true
    : false;
  afterHasDemoUserIdParams: 'DemoUserIdParams' extends keyof _MissingProviderProbe<_LazyLayoutChildAfterAppConfig>
    ? true
    : false;
};
