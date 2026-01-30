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
  {
    path: 'list-with-pagination',
    loadComponent: () =>
      import('./examples/primitives/list-with-pagination/list-with-pagination'),
  },
  {
    path: 'granular-mutation',
    loadComponent: () =>
      import('./examples/primitives/granular-mutation/granular-mutation'),
  },
  {
    path: 'full-demo',
    loadComponent: () => import('./examples/primitives/full-demo/full-demo'),
  },
  {
    path: 'craft/query/:userId',
    loadComponent: () => import('./examples/craft/query/query'),
  },
  {
    path: 'craft/mutation/:userId',
    loadComponent: () => import('./examples/craft/mutation/mutation'),
  },
  {
    path: 'craft/list-with-pagination',
    loadComponent: () =>
      import('./examples/craft/list-with-pagination/list-with-pagination'),
  },
  {
    path: 'craft/granular-mutation',
    loadComponent: () =>
      import('./examples/craft/granular-mutation/granular-mutation'),
  },
  {
    path: 'craft/full-demo',
    loadComponent: () => import('./examples/craft/full-demo/full-demo'),
  },
];
