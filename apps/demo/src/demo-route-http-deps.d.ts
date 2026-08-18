import type { RouteHttpDepsByPath } from '@craft-ts/core';

declare global {
  type DemoAppMetaData =
    typeof import('./app/app.config').appConfig.APP_CONFIG_META_DATA;

  type DemoRouteHttpDeps = RouteHttpDepsByPath<DemoAppMetaData>;
}

declare module '@craft-ts/core' {
  interface CraftRouteHttpDepsRegistry {
    DemoApp: DemoRouteHttpDeps;
  }
}

export {};
