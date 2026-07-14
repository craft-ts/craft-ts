import {
  craftUse,
  abstract,
  assertChildRouteMounts,
  assertExhaustiveRouteExceptions,
  craftException,
  craftExceptionHandler,
  craftGen,
  craftResolve,
  craftRoutes,
  craftService,
  query,
  queryParam,
  craftRoute,
  type CanRun,
  type CraftRouteExceptionType,
  type CraftRouteLazyLoadHelpers,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import type { Router } from '@angular/router';

export const {
  demoRoutes,
  injectDemoTeamIdParams,
  injectDemoCraftLazyLayoutTeamIdData,
  injectDemoUserIdParams,
  injectDemoQueryParamQueryParams,
} = craftRoutes('demo', [
  craftRoute(
    'query/:userId', // todo change the canActivate/gauard to another dedicated route
    {
      componentDeps:
        {} as import('./examples/primitives/query/query').GenDeps_GlobalQuery,
      loadComponent: ({ withRetry }: CraftRouteLazyLoadHelpers) =>
        withRetry(import('./examples/primitives/query/query')),
      canActivate: function* () {
        return yield* authGuard();
      },
      resolve: craftResolve(function* () {
        return yield* loadProfile();
      }),
    },
    {
      // Centralised + exhaustive over canActivate ∪ canMatch ∪ resolve, enforced at
      // the call site. The URL commits immediately; the outlet routes these
      // exceptions after commit.
      NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/login-form');
      }),
      USER_DISABLED: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ).withProviders(({ GuardedDataToYield }) => [
    provideUser(function* () {
      const guardedUser = yield* GuardedDataToYield();
      return guardedUser();
    }),
  ]),
  {
    // Slow guard + slow resolve demo for `CraftRouterOutlet`. Lazy child
    // collection so it stays out of this file's (saturated) cascade DI budget.
    path: 'slow-page',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./examples/routes/slow-page/slow-page.routes')).then(
        (m) => m.slowPageRoutes,
      ),
  },
  {
    // View Transitions demo (gallery → detail, shared-element morph). Lazy child
    // collection, same rationale as slow-page: kept out of the cascade DI budget.
    path: 'view-transitions',
    loadChildren: ({ withRetry }) =>
      withRetry(
        import('./examples/routes/view-transitions/view-transitions.routes'),
      ).then((m) => m.viewTransitionsRoutes),
  },
  {
    path: '',
    loadComponent: ({ withRetry }) => withRetry(import('./test')),
    componentDeps: {} as import('./test').GenDeps_TestComponent,
  },
  {
    path: 'mutation/:userId',
    componentDeps:
      {} as import('./examples/primitives/mutation/mutation').GenDeps_GlobalQuery,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/primitives/mutation/mutation')),
  },
  {
    path: 'list-with-pagination',
    componentDeps:
      {} as import('./examples/primitives/list-with-pagination/list-with-pagination').GenDeps_ListWithPagination,
    loadComponent: ({ withRetry }) =>
      withRetry(
        import(
          './examples/primitives/list-with-pagination/list-with-pagination'
        ),
      ),
  },
  {
    path: 'granular-mutation',
    componentDeps:
      {} as import('./examples/primitives/granular-mutation/granular-mutation').GenDeps_GranularMutation,
    loadComponent: ({ withRetry }) =>
      withRetry(
        import('./examples/primitives/granular-mutation/granular-mutation'),
      ),
  },
  {
    path: 'full-demo',
    componentDeps:
      {} as import('./examples/primitives/full-demo/full-demo').GenDeps_FullDemo,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/primitives/full-demo/full-demo')),
  },
  {
    path: 'pixel-art',
    componentDeps:
      {} as import('./examples/primitives/pixel-art/pixel-art').GenDeps_PixelArt,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/primitives/pixel-art/pixel-art')),
  },
  {
    path: 'pixel-art-matrix',
    componentDeps:
      {} as import('./examples/primitives/pixel-art-matrix/pixel-art-matrix').GenDeps_PixelArtMatrix,
    loadComponent: ({ withRetry }) =>
      withRetry(
        import('./examples/primitives/pixel-art-matrix/pixel-art-matrix'),
      ),
  },
  {
    path: 'exceptions',
    componentDeps:
      {} as import('./examples/primitives/exceptions/exceptions').GenDeps_ExceptionsComponent,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/primitives/exceptions/exceptions')),
  },
  {
    path: 'exception-query-param',
    componentDeps:
      {} as import('./examples/primitives/exceptions/exception-query-param').GenDeps_ExceptionQueryParamComponent,
    loadComponent: ({ withRetry }) =>
      withRetry(
        import('./examples/primitives/exceptions/exception-query-param'),
      ),
  },
  {
    path: 'craft/query/:userId',
    componentDeps:
      {} as import('./examples/craft/query/query').GenDeps_GlobalQuery,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/craft/query/query')),
  },
  {
    path: 'craft/mutation/:userId',
    componentDeps:
      {} as import('./examples/craft/mutation/mutation').GenDeps_MutationCraft,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/craft/mutation/mutation')),
  },
  {
    path: 'craft/list-with-pagination',
    componentDeps:
      {} as import('./examples/craft/list-with-pagination/list-with-pagination').GenDeps_ListWithPaginationCraft,
    loadComponent: ({ withRetry }) =>
      withRetry(
        import('./examples/craft/list-with-pagination/list-with-pagination'),
      ),
  },
  {
    path: 'craft/granular-mutation',
    componentDeps:
      {} as import('./examples/craft/granular-mutation/granular-mutation').GenDeps_GranularMutationCraft,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/craft/granular-mutation/granular-mutation')),
  },
  {
    path: 'craft/full-demo',
    componentDeps:
      {} as import('./examples/craft/full-demo/full-demo').GenDeps_FullDemoCraft,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/craft/full-demo/full-demo')),
  },
  {
    path: 'craft/lazy-layout/:teamId',
    data: {
      someParentRouteData: 'foo',
    },
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/craft/lazy-layout/lazy-layout')),
    componentDeps:
      {} as import('./examples/craft/lazy-layout/lazy-layout').GenDeps_LazyLayoutComponent,
    loadChildren: ({ withRetry }) =>
      withRetry(import('./examples/craft/lazy-layout/lazy-layout.routes')).then(
        (m) => m.lazyLayoutRoutes,
      ),
  },
  {
    path: 'login-form',
    componentDeps:
      {} as import('./examples/primitives/forms/login-form').GenDeps_LoginFormComponent,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/primitives/forms/login-form')),
  },
  {
    path: 'craft-service/counter',
    componentDeps:
      {} as import('./examples/craft-service/craft-service-counter').GenDeps_CraftServiceCounterComponent,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/craft-service/craft-service-counter')),
  },
  {
    path: 'craft-service/user-detail',
    componentDeps:
      {} as import('./examples/craft-service/craft-service-user-detail').GenDeps_CraftServiceUserDetailComponent,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/craft-service/craft-service-user-detail')),
  },
  {
    path: 'demo-send-context',
    componentDeps:
      {} as import('./examples/ia/demo-send-context/demo-send-context').GenDeps_DemoSendContextComponent,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/ia/demo-send-context/demo-send-context')),
  },
  {
    path: 'playground',
    componentDeps:
      {} as import('./examples/playground/playground').GenDeps_PlaygroundComponent,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./examples/playground/playground')),
  },
  {
    path: 'query-param',
    componentDeps:
      {} as import('./examples/routes/list-with-pagination/qp-list-with-pagination').GenDeps_QpListWithPagination,
    loadComponent: ({ withRetry }) =>
      withRetry(
        import(
          './examples/routes/list-with-pagination/qp-list-with-pagination'
        ),
      ),
    queryParams: () =>
      queryParam(
        {
          state: {
            page: {
              fallbackValue: 1,
              parse: (value) => parseInt(value, 10),
              serialize: (value) => String(value),
            },
            pageSize: {
              fallbackValue: 4,
              parse: (value) => parseInt(value, 10),
              serialize: (value) => String(value),
            },
          },
        },
        ({ patch, state }) => ({
          nextPage: () => patch({ page: state().page + 1 }),
          previousPage: () => patch({ page: state().page - 1 }),
          updatePageSize: (newPageSize: number) =>
            patch({ pageSize: newPageSize, page: 1 }),
        }),
      ),
  },
]);

declare module '@craft-ng/core' {
  interface CraftRouterRoutesRegistry {
    Demo: typeof demoRoutes.META_PATHS;
  }
}

// Required-handler safety net: a route whose guards/resolve can throw but that was
// authored with the 2-arg `craftRoute()` form (no handlers) shows its reachable codes as
// unhandled here. The 3-arg form already enforces exhaustiveness at the call site.
assertExhaustiveRouteExceptions(demoRoutes);

// Placement safety: every `.withParent`-pinned lazy child (e.g. view-transitions)
// must be mounted under the route path it declared. Scoped to this parent file.
assertChildRouteMounts(demoRoutes);

const { UserRequirement, provideUser } = craftService(
  {
    name: 'User',
    scope: 'abstract',
  },
  abstract<User>(),
);

// Reusable, composable guard: yields the tracked `Auth` dependency and either
// returns the authenticated user (guarded data) or short-circuits with a typed
// `craftException`. Composed via `yield*` inside the route's `canActivate` below.
const authGuard = craftGen(function* () {
  const user = yield* AuthToYield();
  const userSafeValue = user.safeValue();

  return userSafeValue
    ? userSafeValue
    : craftException({ code: 'NOT_AUTHENTICATED' });
});

type Profile = { displayName: string };

// Resolve step: loads the profile after the URL has committed (the outlet shows
// the pending component while it is in flight). It may short-circuit with a
// `USER_DISABLED` business exception, which `handleExceptions` delegates to the
// global error component.
const loadProfile = craftGen(function* () {
  const user = yield* AuthToYield();
  return user.safeValue()
    ? ({ displayName: 'Ada Lovelace' } satisfies Profile)
    : craftException({ code: 'USER_DISABLED' });
});

// Maintained by the `global-exception-registry-match` ESLint autofix: every code a
// route delegates to the global error component via `globalError()` is mirrored
// here, so `injectCraftGlobalError()` is typed + exhaustive. Do not edit by hand.
declare module '@craft-ng/core' {
  interface CraftGlobalExceptionRegistry {
    'query/:userId': {
      USER_DISABLED: CraftRouteExceptionType<
        typeof demoRoutes,
        'query/:userId',
        'USER_DISABLED'
      >;
    };
  }
}

// Cascade DI check — one alias for the whole route file (no per-component boilerplate).
// Route-level providers are already stripped from META_DATA[N].missingProvider
// by craftRoutes; only the app-level context needs to be passed here.
// Cascade DI check — one alias for the whole route file (no per-component boilerplate).
// AppProvidedNames: CraftRouter (scope 'manuallyProvidedAtRoot', provided by
// provideCraftRouter in app.config — its tracked dependency surfaces in
// missingProvider as metadata, so it must be acknowledged by NAME here).
// AppProvidedValues: Router (provided by value via provideCraftRouter).
// Note: AppProvidedServiceNamesOf<typeof appConfig> hits TS2589 for this app because
// the demo providers (fn wrappers, monitoring, etc.) are too complex for TypeScript
// to evaluate in a generic constraint. Listing the value types explicitly is the workaround.
type _CheckDemoDI = ValidateCascadeRoutesFile<
  'CraftRouter',
  Router,
  typeof demoRoutes
>;
type _CanRunDemo = CanRun<_CheckDemoDI>;

type User = {
  name: string;
};

const { AuthToYield } = craftService({ name: 'Auth', scope: 'global' }, () => {
  return craftUse(
    query({
      params: () => true,
      loader: async () => ({}) as User,
    }),
  );
});
