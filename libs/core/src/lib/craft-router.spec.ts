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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CraftRouterLink,
  injectCraftRouter,
  provideCraftRouter,
} from './craft-router';
import { injectTrackTags } from './host-tag';
import { craftRoutes } from './craft-routes';
import { queryParam } from './query-param';

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

declare module './craft-router' {
  interface CraftRouterRoutesRegistry {
    CraftRouterTest: CraftRouterTestRoutesMetaData;
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

  it('should tag CraftRouter navigate calls with navigateTo', async () => {
    await TestBed.configureTestingModule({
      providers: [provideCraftRouter(craftRouterTestRoutes.toRoutes())],
    }).compileComponents();

    const router = TestBed.runInInjectionContext(() => injectCraftRouter());
    const angularRouter = TestBed.inject(Router);
    let capturedTags: readonly string[] = [];

    vi.spyOn(angularRouter, 'navigate').mockImplementation(async () => {
      capturedTags = injectTrackTags() as readonly string[];
      return true;
    });

    await router.navigate({
      to: 'users/:userId',
      params: { userId: '42' },
    });

    expect(capturedTags).toContain('navigateTo');
  });

  it('should tag CraftRouterLink click navigation with navigateTo', async () => {
    await TestBed.configureTestingModule({
      imports: [CraftRouterLinkHostComponent],
      providers: [provideCraftRouter(craftRouterTestRoutes.toRoutes())],
    }).compileComponents();

    const angularRouter = TestBed.inject(Router);
    let capturedTags: readonly string[] = [];

    vi.spyOn(angularRouter, 'navigateByUrl').mockImplementation(async () => {
      capturedTags = injectTrackTags() as readonly string[];
      return true;
    });

    const fixture = TestBed.createComponent(CraftRouterLinkHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.debugElement.query(By.css('a')).triggerEventHandler('click', {
      button: 0,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    });
    await fixture.whenStable();

    expect(capturedTags).toContain('navigateTo');
  });
});
