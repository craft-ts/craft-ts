import { craftRoutes } from '@craft-ng/core';

const emptyComponentDeps = {};

export const { appRoutes } = craftRoutes([
  {
    path: '',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./test'),
  },
  {
    path: 'query/:userId',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/primitives/query/query'),
  },
  {
    path: 'mutation/:userId',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/primitives/mutation/mutation'),
  },
  {
    path: 'list-with-pagination',
    componentDeps: emptyComponentDeps,
    loadComponent: () =>
      import('./examples/primitives/list-with-pagination/list-with-pagination'),
  },
  {
    path: 'granular-mutation',
    componentDeps: emptyComponentDeps,
    loadComponent: () =>
      import('./examples/primitives/granular-mutation/granular-mutation'),
  },
  {
    path: 'full-demo',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/primitives/full-demo/full-demo'),
  },
  {
    path: 'pixel-art',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/primitives/pixel-art/pixel-art'),
  },
  {
    path: 'pixel-art-matrix',
    componentDeps: emptyComponentDeps,
    loadComponent: () =>
      import('./examples/primitives/pixel-art-matrix/pixel-art-matrix'),
  },
  {
    path: 'exceptions',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/primitives/exceptions/exceptions'),
  },
  {
    path: 'exception-query-param',
    componentDeps: emptyComponentDeps,
    loadComponent: () =>
      import('./examples/primitives/exceptions/exception-query-param'),
  },
  {
    path: 'craft/query/:userId',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/craft/query/query'),
  },
  {
    path: 'craft/mutation/:userId',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/craft/mutation/mutation'),
  },
  {
    path: 'craft/list-with-pagination',
    componentDeps: emptyComponentDeps,
    loadComponent: () =>
      import('./examples/craft/list-with-pagination/list-with-pagination'),
  },
  {
    path: 'craft/granular-mutation',
    componentDeps: emptyComponentDeps,
    loadComponent: () =>
      import('./examples/craft/granular-mutation/granular-mutation'),
  },
  {
    path: 'craft/full-demo',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/craft/full-demo/full-demo'),
  },
  {
    path: 'login-form',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/primitives/forms/login-form'),
  },
  {
    path: 'team-invitations',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/primitives/forms/team-invitations'),
  },
  {
    path: 'craft-service/counter',
    componentDeps: emptyComponentDeps,
    loadComponent: () =>
      import('./examples/craft-service/craft-service-counter'),
  },
  {
    path: 'craft-service/user-detail',
    componentDeps: emptyComponentDeps,
    loadComponent: () =>
      import('./examples/craft-service/craft-service-user-detail'),
  },
  {
    path: 'playground',
    componentDeps: emptyComponentDeps,
    loadComponent: () => import('./examples/playground/playground'),
  },
]);
