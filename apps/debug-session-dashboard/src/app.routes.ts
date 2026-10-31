import { craftRoutes, assertExhaustiveRouteExceptions } from '@craft-ts/core';

/** The route table is split by page so each page can load its own route chunk. */
export const { dashboardRoutes } = craftRoutes('dashboard', [
  {
    path: '',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./sessions.routes')).then(
        (module) => module.sessionsRoutes,
      ),
  },
  {
    path: 'sessions',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./replay.routes')).then(
        (module) => module.replayRoutes,
      ),
  },
  {
    path: 'recipes',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./recipes.routes')).then(
        (module) => module.recipesRoutes,
      ),
  },
  {
    path: 'compare',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./comparison.routes')).then(
        (module) => module.comparisonRoutes,
      ),
  },
  {
    path: 'e2e-replay',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./e2e-replay.routes')).then(
        (module) => module.e2eReplayRoutes,
      ),
  },
  {
    // Imported recordings have no archive id, but keep their standalone URL.
    path: 'import',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./replay.routes')).then(
        (module) => module.replayRoutes,
      ),
  },
]);
assertExhaustiveRouteExceptions(dashboardRoutes);

// This app navigates from its pages back into the route tree. Keep the registry
// literal to avoid a type cycle through the lazy page component imports above.
type DashboardRoutePath =
  | ''
  | 'sessions/:sessionId'
  | 'recipes'
  | 'recipes/:recipeId'
  | 'compare'
  | 'e2e-replay'
  | 'import';

type DashboardRouteRegistry = {
  [Path in DashboardRoutePath]: Path extends 'e2e-replay'
    ? { path: Path; queryParams: { source: string } }
    : { path: Path };
}[DashboardRoutePath][];

declare module '@craft-ts/core' {
  interface CraftRouterRoutesRegistry {
    Dashboard: DashboardRouteRegistry;
  }
}
