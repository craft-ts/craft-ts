import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./test'),
  },
  {
    path: 'no-store/:userId',
    loadComponent: () => import('./examples/primitives/query/query'),
  },
];
