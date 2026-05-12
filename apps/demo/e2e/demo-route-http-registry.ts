import { RouteHttpDepsByPath } from '@craft-ng/core';

type DemoAppMetaData =
  typeof import('../src/app/app.config').appConfig.APP_CONFIG_META_DATA;

type DemoRouteHttpDeps = RouteHttpDepsByPath<DemoAppMetaData>;

declare module '../../../libs/core/src/lib/mock-http-request-for-route' {
  interface CraftRouteHttpDepsRegistry {
    DemoApp: DemoRouteHttpDeps;
  }
}

export {};
