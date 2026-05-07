declare global {
  type DemoAppMetaData =
    typeof import('./app/app.config').appConfig.APP_CONFIG_META_DATA;

  type DemoRouteHttpDeps =
    import('@craft-ng/core').RouteHttpDepsByPath<DemoAppMetaData>;
}

declare module '@craft-ng/core' {
  interface CraftRouteHttpDepsRegistry {
    DemoApp: DemoRouteHttpDeps;
  }
}

export {};
