// @vitest-environment jsdom
import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Router, RouterLinkActive } from '@angular/router';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Equal, Expect } from 'test-type';
import type { ExtractDeps } from './branded-component/branded-component';
import { Console } from './browser-boundaries';
import { craftMethod } from './craft-method';
import {
  CraftRouterLink,
  CraftRouterToYield,
  injectCraftRouter,
  provideCraftRouter,
} from './craft-router';
import { craftRoutes } from './craft-routes';
import type { GetToYieldServiceDependencies } from './craft-service';
import { queryParam } from './query-param';
import { viewTransitionPayload } from './craft-view-transition';

@Component({
  standalone: true,
  template: '',
})
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
    path: 'query-param',
    component: BlankComponent,
    componentDeps: {},
    queryParams: () =>
      queryParam({
        state: {
          page: {
            fallbackValue: 1,
            parse: (value: string) => parseInt(value, 10),
            serialize: (value: number) => String(value),
          },
          pageSize: {
            fallbackValue: 10,
            parse: (value: string) => parseInt(value, 10),
            serialize: (value: number) => String(value),
          },
        },
      }),
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

@Component({
  standalone: true,
  imports: [CraftRouterLink, RouterLinkActive],
  template: `
    <a
      [craftRouterLink]="{
        to: 'users/:userId',
        params: { userId: '42' },
        queryParamsHandling: 'merge',
      }"
      routerLinkActive="active"
      >User</a
    >
  `,
})
class CraftRouterLinkHostComponent {}

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('CraftRouter', () => {
  it('should expose type-safe route inputs', () => {
    TestBed.configureTestingModule({
      providers: [provideCraftRouter(craftRouterTestRoutes.toRoutes())],
    });

    TestBed.runInInjectionContext(() => {
      const router = injectCraftRouter();

      if (false) {
        router.createUrlTree({ to: '' });
        router.navigateByUrl({
          to: 'users/:userId',
          params: { userId: '1' },
        });
        router.navigate({
          to: 'query-param',
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
            // @ts-expect-error route params must be strings
            userId: 1,
          },
        });

        router.navigateByUrl({
          to: 'users/:userId',
          params: {
            userId: '1',
            // @ts-expect-error extra route params are rejected
            teamId: '2',
          },
        });

        router.navigateByUrl({
          to: 'query-param',
          queryParams: {
            // @ts-expect-error query params must be strings
            page: 2,
          },
        });

        router.navigateByUrl({
          to: 'query-param',
          queryParams: {
            page: '2',
            // @ts-expect-error unknown query params are rejected
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
  });

  it('should create and navigate to typed absolute urls', async () => {
    await TestBed.configureTestingModule({
      providers: [provideCraftRouter(craftRouterTestRoutes.toRoutes())],
    }).compileComponents();

    const angularRouter = TestBed.inject(Router);
    const craftRouter = TestBed.runInInjectionContext(() =>
      injectCraftRouter(),
    );

    const userTree = craftRouter.createUrlTree({
      to: 'users/:userId',
      params: { userId: '42' },
    });

    expect(angularRouter.serializeUrl(userTree)).toBe('/users/42');

    const queryTree = craftRouter.createUrlTree({
      to: 'query-param',
      queryParams: {
        page: '2',
        pageSize: '20',
      },
      fragment: 'top',
    });

    expect(angularRouter.serializeUrl(queryTree)).toBe(
      '/query-param?page=2&pageSize=20#top',
    );

    await craftRouter.navigateByUrl({
      to: 'users/:userId',
      params: { userId: '42' },
      replaceUrl: true,
    });
    expect(angularRouter.url).toBe('/users/42');

    await craftRouter.navigate({
      to: 'query-param',
      queryParams: {
        page: '3',
      },
    });
    expect(angularRouter.url).toBe('/query-param?page=3');
  });

  it('should render CraftRouterLink href and keep routerLinkActive compatible', async () => {
    await TestBed.configureTestingModule({
      imports: [CraftRouterLinkHostComponent],
      providers: [provideCraftRouter(craftRouterTestRoutes.toRoutes())],
    }).compileComponents();

    const fixture = TestBed.createComponent(CraftRouterLinkHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const anchor = fixture.nativeElement.querySelector(
      'a',
    ) as HTMLAnchorElement;

    expect(anchor.getAttribute('href')).toContain('/users/42');

    fixture.debugElement.query(By.css('a')).triggerEventHandler('click', {
      button: 0,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/users/42');
  });

  it('should expose CraftRouter dependency through ExtractDeps when a craftMethod yields CraftRouterToYield', () => {
    // Regression test for a bug where `CraftRouterYieldRequest` was extracted
    // via `ReturnType<typeof CraftRouterToYieldInternal>` — `ReturnType` picks
    // the *last* overload, whose generator's yield collapsed to `unknown` once
    // the generic params were unbound. The result was that any craftMethod
    // delegating to `CraftRouterToYield` had `Yielded = unknown`, so
    // `ExtractDeps<...>` returned `{}` instead of `{ CraftRouter: ... }`.
    class GoToHome {
      readonly navigate = craftMethod('navigate', this, function* () {
        const router = yield* CraftRouterToYield();
        return router.navigate({ to: '' });
      });
    }

    type ExpectedDeps = {
      CraftRouter: GetToYieldServiceDependencies<typeof CraftRouterToYield>;
    };
    type _Check = Expect<Equal<ExtractDeps<GoToHome['navigate']>, ExpectedDeps>>;
  });

  it('should accept nested paths joined from loadChildren in craftRouterLink and navigate', () => {
    // Regression test: `META_PATHS` initially mapped only over the top-level
    // routes, so children loaded via `loadChildren` were missing from
    // `NavigableRoutePath`. Templates and shortcut calls using a joined path
    // such as `'parent/:teamId/child/:userId'` errored as "not assignable to
    // NavigableRoutePath" even though the route was registered.
    @Component({
      standalone: true,
      imports: [CraftRouterLink],
      template: `
        <a
          [craftRouterLink]="{
            to: 'parent/:teamId/child/:userId',
            params: { teamId: '1', userId: '42' },
          }"
        ></a>
      `,
    })
    class NestedHost {}

    expect(NestedHost).toBeDefined();

    if (false) {
      TestBed.runInInjectionContext(() => {
        const router = injectCraftRouter();
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
      });
    }
  });

  it('should keep per-service deps when a craftMethod yields multiple services alongside raw injector helpers', () => {
    // Regression test for a bug in `DependencyRecord` where raw yield helpers
    // (e.g. the ones inside `Console.*` boundary methods that use
    // `HostTagToYield` / `TrackTagsToYield`) structurally matched
    // `ServiceYieldRequest<any, any, any>` despite carrying no explicit
    // metadata — so `Name` widened to `string` and `[Key in Name]` collapsed
    // the merged deps map to a `{ [x: string]: ... }` index signature instead
    // of preserving each service's literal name.
    class MultiYield {
      readonly run = craftMethod('run', this, function* () {
        yield* Console.log('navigating');
        yield* CraftRouterToYield();
      });
    }

    type ExpectedDeps = {
      ConsoleService: {
        scope: 'global';
        dependencies: {};
        browserBoundary: true;
        appStart: false;
      };
      CraftRouter: GetToYieldServiceDependencies<typeof CraftRouterToYield>;
    };
    type _Check = Expect<Equal<ExtractDeps<MultiYield['run']>, ExpectedDeps>>;
  });
});
