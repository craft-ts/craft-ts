import { loadCraftComponent } from '@craft-ts/component';
import { craftRoutes } from '@craft-ts/core';

export const { appRoutes } = craftRoutes('app', [
  {
    path: '',
    ...loadCraftComponent(async () => {
      const { ServerFunctionDemo } = await import('./server-function-demo');
      return ServerFunctionDemo;
    }),
  },
  {
    path: 'simple-list',
    ...loadCraftComponent(async () => {
      const { SimpleListDemo } = await import('./simple-list-demo');
      return SimpleListDemo;
    }),
  },
]);

declare module '@craft-ts/core' {
  interface CraftRouterRoutesRegistry {
    DemoWithServerFunction: typeof appRoutes.META_PATHS;
  }
}
