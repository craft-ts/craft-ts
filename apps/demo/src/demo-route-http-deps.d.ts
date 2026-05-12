import type { RouteHttpDepsByPath } from '@craft-ng/core';

declare global {
  type DemoAppMetaData =
    typeof import('./app/app.config').appConfig.APP_CONFIG_META_DATA;

  type DemoRouteHttpDeps = RouteHttpDepsByPath<DemoAppMetaData>;
}

declare module '@craft-ng/core' {
  interface CraftRouteHttpDepsRegistry {
    DemoApp: DemoRouteHttpDeps;
  }
}

export {};
