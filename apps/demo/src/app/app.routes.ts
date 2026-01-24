import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./test'),
  },
  {
    path: 'query/:userId',
    loadComponent: () => import('./examples/primitives/query/query'),
  },
  {
    path: 'mutation/:userId',
    loadComponent: () => import('./examples/primitives/mutation/mutation'),
  },
];
