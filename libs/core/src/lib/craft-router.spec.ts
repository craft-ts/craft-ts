// @vitest-environment jsdom
import { TestBed } from './host/craft-test-bed';
import { craftUse } from './craft-use';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Equal, Expect } from 'test-type';
import type { ExtractDeps } from './branded-component/branded-component';
import { Console } from './browser-boundaries';
import { craftMethod } from './craft-method';
import {
  CraftRouter,
  CRAFT_HISTORY,
  provideCraftRouter,
  shouldHandleCraftRouterLinkClick,
} from './craft-router';
import { craftRoutes } from './craft-routes';
import type { GetServiceDependencies } from './craft-service';
import { queryParams } from './query-params';
import { viewTransitionPayload } from './craft-view-transition';

class BlankComponent {}

const { craftRouterTestRoutes } = craftRoutes('craftRouterTest', [
  {
    path: '',
    component: BlankComponent,
    componentDeps: {},
  },
  {
    path: 'users/:userId',
    component: BlankComponent,
    componentDeps: {},
  },
  {
    path: 'list',
    component: BlankComponent,
    componentDeps: {},
  },
  {
    path: 'auth/login',
    component: BlankComponent,
    componentDeps: {},
  },
  {
    path: 'query-params',
    component: BlankComponent,
    componentDeps: {},
    queryParams: function* () {
      const pagination = yield* queryParams('pagination', {
        state: {
          page: {
            fallbackValue: 1,
            codec: {
              decode: (value: string) => parseInt(value, 10),
              encode: (value: number) => String(value),
            },
          },
          pageSize: {
            fallbackValue: 10,
            codec: {
              decode: (value: string) => parseInt(value, 10),
              encode: (value: number) => String(value),
            },
          },
        },
      });
      return pagination;
    },
  },
  {
    path: '**',
    component: BlankComponent,
    componentDeps: {},
  },
]);

type CraftRouterTestRoutesMetaData = typeof craftRouterTestRoutes.META_DATA;

const { craftRouterNestedTestRoutes } = craftRoutes('craftRouterNestedTest', [
  {
    // Opts into the outlet-driven view transition by DECLARING the payload
    // shape: navigations to it must pass a `viewTransition` payload of that shape
    // (or an explicit `null` opt-out).
    path: 'media/:mediaId',
    component: BlankComponent,
    componentDeps: {},
    withLoaderViewTransitionImage: viewTransitionPayload<{
      name: string;
      image: string | null;
    }>(),
  },
  {
    path: 'parent/:teamId',
    component: BlankComponent,
    componentDeps: {},
    loadChildren: () =>
      Promise.resolve(
        craftRoutes('craftRouterNestedTestChildren', [
          {
            path: 'child/:userId',
            component: BlankComponent,
            componentDeps: {},
          },
        ]).craftRouterNestedTestChildrenRoutes,
      ),
  },
]);

declare module './craft-router' {
  interface CraftRouterRoutesRegistry {
    CraftRouterTest: CraftRouterTestRoutesMetaData;
    CraftRouterNestedTest: typeof craftRouterNestedTestRoutes.META_PATHS;
  }
}

class CraftRouterLinkHostComponent {}

beforeEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});

describe('CraftRouter', () => {
  it('should expose type-safe route inputs', () => {
    TestBed.configureTestingModule({
      providers: [provideCraftRouter(craftRouterTestRoutes.toRoutes())],
    });

    TestBed.runInInjectionContext(() => {
      const router = craftUse(CraftRouter());

      if (false) {
        router.createUrlTree({ to: '' });
        router.navigateByUrl({
          to: 'users/:userId',
          params: { userId: '1' },
        });
        router.navigate({
          to: 'query-params',
          queryParams: {
            page: '2',
          },
        });

        // @ts-expect-error route is not registered
        router.navigateByUrl({ to: 'unknown' });

        // @ts-expect-error params are required for dynamic routes
        router.navigateByUrl({ to: 'users/:userId' });

        router.navigateByUrl({
          to: 'users/:userId',
          params: {
            userId: '1',
          },
        });

        // @ts-expect-error route params must be strings
        router.navigateByUrl({
          to: 'users/:userId',
          params: {
            userId: 1,
          },
        });

        // @ts-expect-error extra route params are rejected
        router.navigateByUrl({
          to: 'users/:userId',
          params: {
            userId: '1',
            teamId: '2',
          },
        });

        // @ts-expect-error query params must be strings
        router.navigateByUrl({
          to: 'query-params',
          queryParams: {
            page: 2,
          },
        });

        // @ts-expect-error unknown query params are rejected
        router.navigateByUrl({
          to: 'query-params',
          queryParams: {
            page: '2',
            unknown: 'x',
          },
        });

        // @ts-expect-error routes without query params reject queryParams
        router.navigateByUrl({
          to: 'list',
          queryParams: {
            page: '2',
          },
        });

        router.navigate({
          to: 'list',
          // @ts-expect-error relative navigation is not supported in v1
          relativeTo: null,
        });

        // @ts-expect-error wildcard routes are not navigable through CraftRouter
        router.navigateByUrl({ to: '**' });
      }
    });
  }, 30_000);

  it('should create and navigate to typed absolute urls', async () => {
    await TestBed.configureTestingModule({
      providers: [provideCraftRouter(craftRouterTestRoutes.toRoutes())],
    }).compileComponents();

    const craftRouter = TestBed.runInInjectionContext(() =>
      craftUse(CraftRouter()),
    );

    const userTree = craftRouter.createUrlTree({
      to: 'users/:userId',
      params: { userId: '42' },
    });

    expect(craftRouter.serializeUrl(userTree)).toBe('/users/42');

    const queryTree = craftRouter.createUrlTree({
      to: 'query-params',
      queryParams: {
        page: '2',
        pageSize: '20',
      },
      fragment: 'top',
    });

    expect(craftRouter.serializeUrl(queryTree)).toBe(
      '/query-params?page=2&pageSize=20#top',
    );

    await craftRouter.navigateByUrl({
      to: 'users/:userId',
      params: { userId: '42' },
      replaceUrl: true,
    });
    expect(craftRouter.url).toBe('/users/42');

    await craftRouter.navigate({
      to: 'query-params',
      queryParams: {
        page: '3',
      },
    });
    expect(craftRouter.url).toBe('/query-params?page=3');
  });

  it('skipLocationChange updates url without changing the address bar', async () => {
    window.history.replaceState(null, '', '/');
    await TestBed.configureTestingModule({
      providers: [provideCraftRouter(craftRouterTestRoutes.toRoutes())],
    }).compileComponents();

    const craftRouter = TestBed.runInInjectionContext(() =>
      craftUse(CraftRouter()),
    );

    await craftRouter.navigateByUrl('/users/42', { skipLocationChange: true });

    expect(craftRouter.url).toBe('/users/42');
    expect(window.location.pathname).toBe('/');
    expect(TestBed.inject(CRAFT_HISTORY).get().pathname).toBe('/users/42');
    expect(
      craftRouter.isActive(
        craftRouter.createUrlTree({
          to: 'users/:userId',
          params: { userId: '42' },
        }),
      ),
    ).toBe(true);
    window.history.replaceState(null, '', '/');
  });

  it('should expose CraftRouter dependency through ExtractDeps when a craftMethod yields CraftRouter', () => {
    // Regression test for a bug where `CraftRouterYieldRequest` was extracted
    // via `ReturnType<typeof CraftRouterInternal>` — `ReturnType` picks
    // the *last* overload, whose generator's yield collapsed to `unknown` once
    // the generic params were unbound. The result was that any craftMethod
    // delegating to `CraftRouter` had `Yielded = unknown`, so
    // `ExtractDeps<...>` returned `{}` instead of `{ CraftRouter: ... }`.
    class GoToHome {
      readonly navigate = craftMethod('navigate', this, function* () {
        const router = yield* CraftRouter();
        return router.navigate({ to: '' });
      });
    }

    type ExpectedDeps = {
      CraftRouter: GetServiceDependencies<typeof CraftRouter>;
    };
    type _Check = Expect<
      Equal<ExtractDeps<GoToHome['navigate']>, ExpectedDeps>
    >;
  });

  it('should accept nested paths joined from loadChildren in craftRouterLink and navigate', () => {
    // Regression test: `META_PATHS` initially mapped only over the top-level
    // routes, so children loaded via `loadChildren` were missing from
    // `NavigableRoutePath`. Templates and shortcut calls using a joined path
    // such as `'parent/:teamId/child/:userId'` errored as "not assignable to
    // NavigableRoutePath" even though the route was registered.
    class NestedHost {}

    expect(NestedHost).toBeDefined();

    if (false) {
      TestBed.runInInjectionContext(() => {
        const router = craftUse(CraftRouter());
        // Joined path resolves at the type level
        router.navigate({
          to: 'parent/:teamId/child/:userId',
          params: { teamId: '1', userId: '42' },
        });
        // @ts-expect-error params required for the joined path
        router.navigate({ to: 'parent/:teamId/child/:userId' });
        // @ts-expect-error params missing userId
        router.navigate({
          to: 'parent/:teamId/child/:userId',
          params: { teamId: '1' },
        });
        // @ts-expect-error typo in joined path
        router.navigate({ to: 'parent/:teamId/childz/:userId' });

        CraftRouter.createUrlTree({
          to: 'parent/:teamId/child/:userId',
          params: { teamId: '1', userId: '42' },
        });
        CraftRouter.navigate({
          to: 'parent/:teamId/child/:userId',
          params: { teamId: '1', userId: '42' },
        });
        CraftRouter.navigateByUrl({
          to: 'parent/:teamId/child/:userId',
          params: { teamId: '1', userId: '42' },
        });
        CraftRouter.createUrlTree({
          to: 'auth/login',
        });

        // A view-transition route REQUIRES a `viewTransition` payload.
        router.navigate({
          to: 'media/:mediaId',
          params: { mediaId: '1' },
          viewTransition: { name: 'photo-1', image: null },
        });
        // `null` is an accepted explicit opt-out.
        router.navigate({
          to: 'media/:mediaId',
          params: { mediaId: '1' },
          viewTransition: null,
        });
        // @ts-expect-error viewTransition is required for a view-transition route
        router.navigate({ to: 'media/:mediaId', params: { mediaId: '1' } });
        router.navigate({
          to: 'media/:mediaId',
          params: { mediaId: '1' },
          // @ts-expect-error viewTransition payload requires a `name`
          viewTransition: { image: null },
        });
        CraftRouter.createUrlTree({
          to: 'media/:mediaId',
          params: { mediaId: '1' },
          viewTransition: { name: 'photo-1', image: null },
        });
        // @ts-expect-error viewTransition is required for a view-transition route
        CraftRouter.createUrlTree({
          to: 'media/:mediaId',
          params: { mediaId: '1' },
        });
      });
    }
  });

  it('should keep per-service deps when a craftMethod yields multiple services alongside raw injector helpers', () => {
    // Regression test for a bug in `DependencyRecord` where raw yield helpers
    // (e.g. the ones inside `Console.*` boundary methods that use
    // `HostTag` / `TrackTags`) structurally matched
    // `ServiceYieldRequest<any, any, any>` despite carrying no explicit
    // metadata — so `Name` widened to `string` and `[Key in Name]` collapsed
    // the merged deps map to a `{ [x: string]: ... }` index signature instead
    // of preserving each service's literal name.
    class MultiYield {
      readonly run = craftMethod('run', this, function* () {
        yield* Console.log('navigating');
        yield* CraftRouter();
      });
    }

    type ExpectedDeps = {
      ConsoleService: {
        providedIn: 'global';
        dependencies: {};
        browserBoundary: true;
        appStart: false;
      };
      CraftRouter: GetServiceDependencies<typeof CraftRouter>;
    };
    type _Check = Expect<Equal<ExtractDeps<MultiYield['run']>, ExpectedDeps>>;
  });

  it('disposes the browser history popstate listener when the injector is destroyed', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    TestBed.configureTestingModule({
      providers: [provideCraftRouter([])],
    });
    TestBed.inject(CRAFT_HISTORY);
    TestBed.resetTestingModule();

    expect(
      removeSpy.mock.calls.some((call) => call[0] === 'popstate'),
    ).toBe(true);
    removeSpy.mockRestore();
  });
});
