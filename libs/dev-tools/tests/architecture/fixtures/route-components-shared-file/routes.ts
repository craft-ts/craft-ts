import { craftRoutes } from '../craft-runtime';

export const appRoutes = craftRoutes('appRoutes', [
  {
    path: 'one',
    loadComponent: () =>
      import('./shared-page').then(({ SharedPageOne }) => SharedPageOne),
  },
  {
    path: 'two',
    loadComponent: () =>
      import('./shared-page').then(({ SharedPageTwo }) => SharedPageTwo),
  },
]);
