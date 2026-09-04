import { RouteHttpDepsByPath } from '@craft-ts/core';

type DemoAppMetaData =
  typeof import('../src/app/app.routes.runtime').demoRoutes.META_DATA;

type DemoRouteHttpDeps = RouteHttpDepsByPath<DemoAppMetaData>;

declare module '../../../libs/core/src/lib/mock-http-request-for-route' {
  interface CraftRouteHttpDepsRegistry {
    DemoApp: DemoRouteHttpDeps;
  }
}

export {};
