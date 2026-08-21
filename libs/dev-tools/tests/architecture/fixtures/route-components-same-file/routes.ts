import {
  craftComponent,
  craftRoutes,
  div,
} from '../craft-runtime';

export const SameFilePage = craftComponent(
  'SameFilePage',
  {},
  function* () {
    return {};
  },
  () => div([]),
);

export const appRoutes = craftRoutes('appRoutes', [
  {
    path: 'same-file',
    component: SameFilePage,
  },
  {
    path: 'same-file-lazy',
    loadComponent: () => Promise.resolve(SameFilePage),
  },
  {
    path: 'same-file-import',
    loadComponent: () =>
      import('./routes').then(({ SameFilePage: page }) => page),
  },
]);
