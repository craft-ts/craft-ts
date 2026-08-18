import {
  assertCssVarsSatisfied,
  loadCraftComponent,
} from '@craft-ts/component';
import {
  assertExhaustiveRouteExceptions,
  craftExceptionHandler,
  craftRoute,
  craftRoutes,
  queryParams,
  type CanRun,
  type ComponentDepsOf,
  type CraftRouteExceptionType,
  type RouteCheckedDI,
  type ViewTransitionPayloadDef,
} from '@craft-ts/core';
import { authGuard } from './guard/auth.guard';
import { paginationQueryParams } from './query-params.utils';
import type { AppProvidedNames, AppProvidedValues } from './app.config';

// SOURCE OF TRUTH FOR THE DEMO ROUTES.
// All demo routes are served and checked by default.
export const { demoRoutes } = craftRoutes('demo', [
  /* demo-route: query */
  {
    path: 'query/:userId',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/query/query')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: debounced-web-search */
  {
    path: 'debounced-web-search',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import(
          './examples/primitives/debounced-web-search/debounced-web-search'
        ),
      ).then(({ default: component }) => component),
    ),
  },

  /* demo-route-end */ /* demo-route: slow-page */
  {
    path: 'slow-page',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./examples/routes/slow-page/slow-page.routes')).then(
        (module) => module.slowPageRoutes,
      ),
  },

  /* demo-route-end */ /* demo-route: view-transitions */
  {
    path: 'view-transitions',
    loadChildren: ({ withRetry }) =>
      withRetry(
        import('./examples/routes/view-transitions/view-transitions.routes'),
      ).then((module) => module.viewTransitionsRoutes),
  },

  /* demo-route-end */ /* demo-route: home */
  {
    path: '',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/component-demo')).then(
        ({ componentDemo }) => componentDemo,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: component-composition */
  {
    path: 'component-composition',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/component-composition-demo')).then(
        ({ componentCompositionDemo }) => componentCompositionDemo,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: content-projection */
  {
    path: 'content-projection',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/content-projection-demo')).then(
        ({ contentProjectionDemo }) => contentProjectionDemo,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: pending-block */
  {
    path: 'pending-block',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/pending-block-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: pending-block-exception */
  {
    path: 'pending-block/exception',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/component/pending-block-exception-demo'),
      ).then(({ default: component }) => component),
    ),
  },

  /* demo-route-end */ /* demo-route: css-vars */
  {
    path: 'css-vars',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/css-vars-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: css-vars-required */
  {
    path: 'css-vars/required',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/css-vars-required-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: css-vars-inheritance */
  {
    path: 'css-vars/inheritance',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/css-vars-inheritance-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: css-vars-forwarding */
  {
    path: 'css-vars/forwarding',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/css-vars-forwarding-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: css-vars-property */
  {
    path: 'css-vars/property',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/css-vars-property-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: mutation */
  craftRoute(
    'mutation/:userId',
    {
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(import('./examples/primitives/mutation/mutation')).then(
          ({ default: component }) => component,
        ),
      ),
    },
    {
      UNEXPECTED_ERROR: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ),

  /* demo-route-end */ /* demo-route: list-with-pagination */
  {
    path: 'list-with-pagination',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import(
          './examples/primitives/list-with-pagination/list-with-pagination'
        ),
      ).then(({ default: component }) => component),
    ),
  },

  /* demo-route-end */ /* demo-route: granular-mutation */
  {
    path: 'granular-mutation',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/primitives/granular-mutation/granular-mutation'),
      ).then(({ default: component }) => component),
    ),
  },

  /* demo-route-end */ /* demo-route: full-demo */
  {
    path: 'full-demo',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/full-demo/full-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: pixel-art */
  {
    path: 'pixel-art',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/pixel-art/pixel-art')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: pixel-art-matrix */
  {
    path: 'pixel-art-matrix',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/primitives/pixel-art-matrix/pixel-art-matrix'),
      ).then(({ default: component }) => component),
    ),
  },

  /* demo-route-end */ /* demo-route: exceptions */
  {
    path: 'exceptions',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/exceptions/exceptions')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: exception-query-params */
  {
    path: 'exception-query-params',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/primitives/exceptions/exception-query-params'),
      ).then(({ default: component }) => component),
    ),
  },

  /* demo-route-end */ /* demo-route: craft-query */
  {
    path: 'craft/query/:userId',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft/query/query')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: craft-mutation */
  {
    path: 'craft/mutation/:userId',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft/mutation/mutation')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: craft-list-with-pagination */
  {
    path: 'craft/list-with-pagination',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/craft/list-with-pagination/list-with-pagination'),
      ).then(({ default: component }) => component),
    ),
  },

  /* demo-route-end */ /* demo-route: craft-granular-mutation */
  {
    path: 'craft/granular-mutation',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/craft/granular-mutation/granular-mutation'),
      ).then(({ default: component }) => component),
    ),
  },

  /* demo-route-end */ /* demo-route: craft-full-demo */
  {
    path: 'craft/full-demo',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft/full-demo/full-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: craft-lazy-layout */
  {
    path: 'craft/lazy-layout/:teamId',
    data: { someParentRouteData: 'foo' },
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft/lazy-layout/lazy-layout')).then(
        ({ default: component }) => component,
      ),
    ),
    loadChildren: ({ withRetry }) =>
      withRetry(import('./examples/craft/lazy-layout/lazy-layout.routes')).then(
        (module) => module.lazyLayoutRoutes,
      ),
  },

  /* demo-route-end */ /* demo-route: login-form */
  {
    path: 'login-form',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/forms/login-form')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: craft-service-counter */
  {
    path: 'craft-service/counter',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft-service/craft-service-counter')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: craft-service-register-for */
  {
    path: 'craft-service/register-for',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft-service/register-for')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: craft-service-user-detail */
  craftRoute(
    'craft-service/user-detail',
    {
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(
          import('./examples/craft-service/craft-service-user-detail'),
        ).then(({ default: component }) => component),
      ),
    },
    {
      UNEXPECTED_ERROR: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ),

  /* demo-route-end */ /* demo-route: demo-send-context */
  {
    path: 'demo-send-context',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/ia/demo-send-context/demo-send-context'),
      ).then(({ default: component }) => component),
    ),
  },

  /* demo-route-end */ /* demo-route: playground */
  {
    path: 'playground',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/playground/playground')).then(
        ({ default: component }) => component,
      ),
    ),
  },

  /* demo-route-end */ /* demo-route: query-params */
  {
    path: 'query-params',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import(
          './examples/routes/list-with-pagination/qp-list-with-pagination'
        ),
      ).then(({ default: component }) => component),
    ),
    queryParams: function* () {
      const pagination = yield* queryParams(
        'pagination',
        paginationQueryParams(),
        ({ patch, state }) => ({
          nextPage: function* () {
            const _state = yield* state();
            return yield* patch({ page: _state.page + 1 });
          },
          previousPage: function* () {
            const _state = yield* state();
            return yield* patch({ page: Math.max(1, _state.page - 1) });
          },
          updatePageSize: function* (pageSize: number) {
            return yield* patch({ pageSize, page: 1 });
          },
        }),
      );
      return pagination;
    },
  },

  /* demo-route-end */ /* demo-route: guard-demo */
  craftRoute(
    'guard-demo',
    {
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(import('./examples/routes/guard-demo/GuardDemo')).then(
          ({ GuardDemo }) => GuardDemo,
        ),
      ),
      canActivate: function* () {
        return yield* authGuard();
      },
    },
    {
      NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/login-form');
      }),
      USER_DISABLED: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ),
  /* demo-route-end */
]);

export const demoEnabledRoutePaths: ReadonlySet<string> = new Set(
  demoRoutes.META_PATHS.map(({ path }) => path),
);

// Keep navigation links type-safe even when the serve prompt excludes some
// routes from the build. This slim registry is intentionally independent from
// the selected runtime collection.
type DemoRoutePath =
  | ''
  | 'query/:userId'
  | 'debounced-web-search'
  | 'slow-page'
  | 'view-transitions'
  | 'view-transitions/:photoId'
  | 'component-composition'
  | 'content-projection'
  | 'pending-block'
  | 'pending-block/exception'
  | 'css-vars'
  | 'css-vars/required'
  | 'css-vars/inheritance'
  | 'css-vars/forwarding'
  | 'css-vars/property'
  | 'mutation/:userId'
  | 'list-with-pagination'
  | 'granular-mutation'
  | 'full-demo'
  | 'pixel-art'
  | 'pixel-art-matrix'
  | 'exceptions'
  | 'exception-query-params'
  | 'craft/query/:userId'
  | 'craft/mutation/:userId'
  | 'craft/list-with-pagination'
  | 'craft/granular-mutation'
  | 'craft/full-demo'
  | 'craft/lazy-layout/:teamId/users/:userId'
  | 'login-form'
  | 'craft-service/counter'
  | 'craft-service/register-for'
  | 'craft-service/user-detail'
  | 'demo-send-context'
  | 'playground'
  | 'query-params'
  | 'guard-demo';
type DemoRoutePaths = readonly {
  [Path in DemoRoutePath]: Path extends 'view-transitions/:photoId'
    ? {
        path: Path;
        viewTransition: ViewTransitionPayloadDef<{
          name: string;
          image: string | null;
        }>;
      }
    : { path: Path };
}[DemoRoutePath][];

declare module '@craft-ts/core' {
  interface CraftRouterRoutesRegistry {
    Demo: DemoRoutePaths;
  }
}

assertExhaustiveRouteExceptions(demoRoutes);
assertCssVarsSatisfied(demoRoutes);

/* demo-check: guard-registry */
declare module '@craft-ts/core' {
  interface CraftGlobalExceptionRegistry {
    'guard-demo': {
      USER_DISABLED: CraftRouteExceptionType<
        typeof demoRoutes,
        'guard-demo',
        'USER_DISABLED'
      >;
    };
    'mutation/:userId': {
      UNEXPECTED_ERROR: CraftRouteExceptionType<
        typeof demoRoutes,
        'mutation/:userId',
        'UNEXPECTED_ERROR'
      >;
    };
    'craft-service/user-detail': {
      UNEXPECTED_ERROR: CraftRouteExceptionType<
        typeof demoRoutes,
        'craft-service/user-detail',
        'UNEXPECTED_ERROR'
      >;
    };
  }
}
/* demo-check-end */
type DemoRouteCheckedDI<
  Component,
  RouteInputs extends string = never,
  Context extends string = 'demo route component',
> = RouteCheckedDI<
  ComponentDepsOf<Component>,
  AppProvidedNames | 'CraftRouter' | 'CraftActivatedRoute',
  AppProvidedValues,
  Context,
  RouteInputs
>;

/* demo-check: query */
type _CanRunQuery = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/query/query'))['default'],
    'userId',
    'path: "query/:userId"'
  >
>;
/* demo-check-end */
/* demo-check: debounced-web-search */
type _CanRunDebouncedWebSearch = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/debounced-web-search/debounced-web-search'))['default'],
    never,
    'path: "debounced-web-search"'
  >
>;
/* demo-check-end */
/* demo-check: home */
type _CanRunComponentDemo = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/component-demo'))['componentDemo'],
    never,
    'path: ""'
  >
>;
/* demo-check-end */
/* demo-check: content-projection */
type _CanRunContentProjection = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/content-projection-demo'))['contentProjectionDemo'],
    never,
    'path: "content-projection"'
  >
>;
/* demo-check-end */
/* demo-check: component-composition */
type _CanRunComponentComposition = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/component-composition-demo'))['componentCompositionDemo'],
    never,
    'path: "component-composition"'
  >
>;
/* demo-check-end */
/* demo-check: pending-block */
type _CanRunPendingBlock = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/pending-block-demo'))['default'],
    never,
    'path: "pending-block"'
  >
>;
/* demo-check-end */
/* demo-check: pending-block-exception */
type _CanRunPendingBlockException = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/pending-block-exception-demo'))['default'],
    never,
    'path: "pending-block/exception"'
  >
>;
/* demo-check-end */
/* demo-check: css-vars */
type _CanRunCssVars = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/css-vars-demo'))['default'],
    never,
    'path: "css-vars"'
  >
>;
/* demo-check-end */
/* demo-check: css-vars-required */
type _CanRunCssVarsRequired = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/css-vars-required-demo'))['default'],
    never,
    'path: "css-vars/required"'
  >
>;
/* demo-check-end */
/* demo-check: css-vars-inheritance */
type _CanRunCssVarsInheritance = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/css-vars-inheritance-demo'))['default'],
    never,
    'path: "css-vars/inheritance"'
  >
>;
/* demo-check-end */
/* demo-check: css-vars-forwarding */
type _CanRunCssVarsForwarding = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/css-vars-forwarding-demo'))['default'],
    never,
    'path: "css-vars/forwarding"'
  >
>;
/* demo-check-end */
/* demo-check: css-vars-property */
type _CanRunCssVarsProperty = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/css-vars-property-demo'))['default'],
    never,
    'path: "css-vars/property"'
  >
>;
/* demo-check-end */
/* demo-check: mutation */
type _CanRunMutation = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/mutation/mutation'))['default'],
    'userId',
    'path: "mutation/:userId"'
  >
>;
/* demo-check-end */
/* demo-check: list-with-pagination */
type _CanRunListWithPagination = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/list-with-pagination/list-with-pagination'))['default'],
    never,
    'path: "list-with-pagination"'
  >
>;
/* demo-check-end */
/* demo-check: granular-mutation */
type _CanRunGranularMutation = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/granular-mutation/granular-mutation'))['default'],
    never,
    'path: "granular-mutation"'
  >
>;
/* demo-check-end */
/* demo-check: full-demo */
type _CanRunFullDemo = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/full-demo/full-demo'))['default'],
    never,
    'path: "full-demo"'
  >
>;
/* demo-check-end */
/* demo-check: pixel-art */
type _CanRunPixelArt = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/pixel-art/pixel-art'))['default'],
    never,
    'path: "pixel-art"'
  >
>;
/* demo-check-end */
/* demo-check: pixel-art-matrix */
type _CanRunPixelArtMatrix = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/pixel-art-matrix/pixel-art-matrix'))['default'],
    never,
    'path: "pixel-art-matrix"'
  >
>;
/* demo-check-end */
/* demo-check: exceptions */
type _CanRunExceptions = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/exceptions/exceptions'))['default'],
    never,
    'path: "exceptions"'
  >
>;
/* demo-check-end */
/* demo-check: exception-query-params */
type _CanRunExceptionQueryParams = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/exceptions/exception-query-params'))['default'],
    never,
    'path: "exception-query-params"'
  >
>;
/* demo-check-end */
/* demo-check: craft-query */
type _CanRunCraftQuery = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/query/query'))['default'],
    'userId',
    'path: "craft/query/:userId"'
  >
>;
/* demo-check-end */
/* demo-check: craft-mutation */
type _CanRunCraftMutation = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/mutation/mutation'))['default'],
    'userId',
    'path: "craft/mutation/:userId"'
  >
>;
/* demo-check-end */
/* demo-check: craft-list-with-pagination */
type _CanRunCraftListWithPagination = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/list-with-pagination/list-with-pagination'))['default'],
    never,
    'path: "craft/list-with-pagination"'
  >
>;
/* demo-check-end */
/* demo-check: craft-granular-mutation */
type _CanRunCraftGranularMutation = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/granular-mutation/granular-mutation'))['default'],
    never,
    'path: "craft/granular-mutation"'
  >
>;
/* demo-check-end */
/* demo-check: craft-full-demo */
type _CanRunCraftFullDemo = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/full-demo/full-demo'))['default'],
    never,
    'path: "craft/full-demo"'
  >
>;
/* demo-check-end */
/* demo-check: craft-lazy-layout */
type _CanRunLazyLayout = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/lazy-layout/lazy-layout'))['default'],
    'teamId' | 'someParentRouteData',
    'path: "craft/lazy-layout/:teamId"'
  >
>;
/* demo-check-end */
/* demo-check: login-form */
type _CanRunLoginForm = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/forms/login-form'))['default'],
    never,
    'path: "login-form"'
  >
>;
/* demo-check-end */
/* demo-check: craft-service-counter */
type _CanRunCraftServiceCounter = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft-service/craft-service-counter'))['default'],
    never,
    'path: "craft-service/counter"'
  >
>;
/* demo-check-end */
/* demo-check: craft-service-register-for */
type _CanRunCraftServiceRegisterFor = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft-service/register-for'))['default'],
    never,
    'path: "craft-service/register-for"'
  >
>;
/* demo-check-end */
/* demo-check: craft-service-user-detail */
type _CanRunCraftServiceUserDetail = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft-service/craft-service-user-detail'))['default'],
    never,
    'path: "craft-service/user-detail"'
  >
>;
/* demo-check-end */
/* demo-check: demo-send-context */
type _CanRunDemoSendContext = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/ia/demo-send-context/demo-send-context'))['default'],
    never,
    'path: "demo-send-context"'
  >
>;
/* demo-check-end */
/* demo-check: playground */
type _CanRunPlayground = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/playground/playground'))['default'],
    never,
    'path: "playground"'
  >
>;
/* demo-check-end */
/* demo-check: query-params */
type _CanRunQueryParams = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/routes/list-with-pagination/qp-list-with-pagination'))['default'],
    never,
    'path: "query-params"'
  >
>;
/* demo-check-end */
/* demo-check: guard-demo */
type _CanRunGuardDemo = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/routes/guard-demo/GuardDemo'))['GuardDemo'],
    never,
    'path: "guard-demo"'
  >
>;
/* demo-check-end */

/* demo-check: child-mount-shared */
type ChildMountCheckedDI<
  ChildRoutes,
  ParentPath extends string,
> = ChildRoutes extends {
  readonly __craftParentMount?: infer Mount extends string;
}
  ? [Mount] extends [ParentPath]
    ? true
    : [`Child routes pinned to "${Mount}" cannot mount at "${ParentPath}"`]
  : ['Expected a Craft routes collection'];
/* demo-check-end */

/* demo-check: view-transitions-mount */
type _CanRunViewTransitionsMount = CanRun<
  ChildMountCheckedDI<
    (typeof import('./examples/routes/view-transitions/view-transitions.routes'))['viewTransitionsRoutes'],
    'view-transitions'
  >
>;
/* demo-check-end */
/* demo-check: craft-lazy-layout-mount */
type _CanRunLazyLayoutMount = CanRun<
  ChildMountCheckedDI<
    (typeof import('./examples/craft/lazy-layout/lazy-layout.routes'))['lazyLayoutRoutes'],
    'craft/lazy-layout/:teamId'
  >
>;
/* demo-check-end */
