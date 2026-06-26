// @vitest-environment jsdom
import '@angular/compiler';
import {
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CRAFT_ROUTE_LOAD_ERROR_CODE,
  CRAFT_ROUTE_LOAD_RECOVERY,
  CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
  CRAFT_ROUTE_LOAD_ERROR_PATH,
  CRAFT_ROUTE_LOAD_RETRY,
  CraftRouteLoadErrorHostComponent,
  createRouteLoadRetry,
  isCraftRouteLoadError,
  loadRouteWithRetry,
  provideRouteLoadErrorComponent,
  type CraftRouteLoadRetry,
  withRouteLoadError,
} from './craft-route-load-error';
import { provideCraftRouter } from './craft-router';

@Component({ standalone: true, template: 'load error' })
class LoadErrorComponent {}

@Component({ standalone: true, template: 'local load error' })
class LocalLoadErrorComponent {}

@Component({ standalone: true, template: 'loaded' })
class LoadedComponent {}

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
  vi.useRealTimers();
});

describe('route load error recovery', () => {
  it('retries a failed route load once with the injected retry strategy', async () => {
    const retry: CraftRouteLoadRetry = {
      execute: async (loader) => loader(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CRAFT_ROUTE_LOAD_RETRY, useValue: retry },
      ],
    });
    const injector = TestBed.inject(EnvironmentInjector);
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('loaded');

    await expect(
      runInInjectionContext(injector, () =>
        loadRouteWithRetry(loader, 'component', 'users'),
      ),
    ).resolves.toBe('loaded');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('creates a configurable retry strategy', async () => {
    const retry = createRouteLoadRetry({ attempts: 2, delayMs: 0 });
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('loaded');

    await expect(
      retry.execute(loader, {
        phase: 'component',
        routePath: 'users',
        targetUrl: '/users',
        attempt: 1,
        error: new Error('initial'),
      }),
    ).resolves.toBe('loaded');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('lets retry options inspect the initial error before retrying', async () => {
    const initial = new TypeError('chunk failed');
    const shouldRetry = vi.fn(() => false);
    const retry = createRouteLoadRetry({
      attempts: 2,
      delayMs: 0,
      shouldRetry,
    });
    const loader = vi.fn<() => Promise<string>>();

    await expect(
      retry.execute(loader, {
        phase: 'component',
        routePath: 'users',
        targetUrl: '/users',
        attempt: 1,
        error: initial,
      }),
    ).rejects.toBe(initial);
    expect(loader).not.toHaveBeenCalled();
    expect(shouldRetry).toHaveBeenCalledWith(
      initial,
      expect.objectContaining({
        attempt: 2,
        error: initial,
        routePath: 'users',
      }),
    );
  });

  it('lets retry options compute a delay per retry attempt', async () => {
    const delayMs = vi.fn(() => 0);
    const retry = createRouteLoadRetry({ attempts: 1, delayMs });
    const loader = vi.fn<() => Promise<string>>().mockResolvedValue('loaded');
    const initial = new Error('initial');

    await expect(
      retry.execute(loader, {
        phase: 'component',
        routePath: 'users',
        targetUrl: '/users',
        attempt: 1,
        error: initial,
      }),
    ).resolves.toBe('loaded');
    expect(delayMs).toHaveBeenCalledWith(
      initial,
      expect.objectContaining({ attempt: 2, error: initial }),
    );
  });

  it('converts the final failure to the reserved craftException', async () => {
    const retry: CraftRouteLoadRetry = {
      execute: async (loader) => loader(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CRAFT_ROUTE_LOAD_RETRY, useValue: retry },
      ],
    });
    const injector = TestBed.inject(EnvironmentInjector);
    const loader = vi.fn<() => Promise<never>>().mockRejectedValue(
      new Error('still broken'),
    );

    const promise = runInInjectionContext(injector, () =>
      loadRouteWithRetry(loader, 'children', 'admin'),
    );

    await expect(promise).rejects.toMatchObject({
      code: CRAFT_ROUTE_LOAD_ERROR_CODE,
      payload: {
        phase: 'children',
        routePath: 'admin',
        targetUrl: '/',
        attempt: 2,
      },
    });
    await promise.catch((error) => expect(isCraftRouteLoadError(error)).toBe(true));
  });

  it('resolves local component and retry overrides from a route injector', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
          useValue: { component: LoadErrorComponent, componentDeps: {} },
        },
      ],
    });
    const root = TestBed.inject(EnvironmentInjector);
    const localRetry: CraftRouteLoadRetry = {
      execute: async (loader) => loader(),
    };
    const routeInjector = createEnvironmentInjector(
      [
        provideRouteLoadErrorComponent({
          component: LocalLoadErrorComponent,
          componentDeps: {},
        }),
        { provide: CRAFT_ROUTE_LOAD_RETRY, useValue: localRetry },
      ],
      root,
    );

    expect(routeInjector.get(CRAFT_ROUTE_LOAD_ERROR_COMPONENT)).toEqual({
      component: LocalLoadErrorComponent,
      componentDeps: {},
    });
    expect(routeInjector.get(CRAFT_ROUTE_LOAD_RETRY)).toBe(localRetry);
    routeInjector.destroy();
  });

  it('registers the eager internal recovery route', () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter(
          [],
          withRouteLoadError({
            component: LoadErrorComponent,
            componentDeps: {},
          }),
        ),
      ],
    });

    const route = TestBed.inject(Router).config.find(
      (entry) => entry.path === CRAFT_ROUTE_LOAD_ERROR_PATH,
    );
    expect(route?.component).toBe(CraftRouteLoadErrorHostComponent);
  });

  it('registers the global retry config from withRouteLoadError', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter(
          [],
          withRouteLoadError({
            component: LoadErrorComponent,
            componentDeps: {},
            retry: { attempts: 2, delayMs: 0 },
          }),
        ),
      ],
    });

    const retry = TestBed.inject(CRAFT_ROUTE_LOAD_RETRY);
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('loaded');

    await expect(
      retry.execute(loader, {
        phase: 'component',
        routePath: 'users',
        targetUrl: '/users',
        attempt: 1,
        error: new Error('initial'),
      }),
    ).resolves.toBe('loaded');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('manual retry re-enters the failing target route after browserUrl recovery redirect', async () => {
    const loader = vi
      .fn<() => Promise<typeof LoadedComponent>>()
      .mockRejectedValueOnce(new Error('blocked chunk'))
      .mockRejectedValueOnce(new Error('still blocked'))
      .mockResolvedValueOnce(LoadedComponent);

    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter(
          [
            {
              path: 'lazy',
              loadComponent: () =>
                loadRouteWithRetry(loader, 'component', 'lazy'),
            },
          ],
          withRouteLoadError({
            component: LoadErrorComponent,
            componentDeps: {},
            retry: { attempts: 1, delayMs: 0 },
          }),
        ),
      ],
    });

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/lazy');

    expect(loader).toHaveBeenCalledTimes(2);
    expect(
      router.routerState.snapshot.root.firstChild?.routeConfig?.path,
    ).toBe(CRAFT_ROUTE_LOAD_ERROR_PATH);

    await TestBed.inject(CRAFT_ROUTE_LOAD_RECOVERY).retry();

    expect(loader).toHaveBeenCalledTimes(3);
    expect(router.url).toBe('/lazy');
    expect(
      router.routerState.snapshot.root.firstChild?.routeConfig?.path,
    ).toBe('lazy');
  });

  it('manual retry keeps the original target after another retry failure', async () => {
    const loader = vi
      .fn<() => Promise<typeof LoadedComponent>>()
      .mockRejectedValueOnce(new Error('blocked chunk'))
      .mockRejectedValueOnce(new Error('still blocked'))
      .mockRejectedValueOnce(new Error('blocked again'))
      .mockRejectedValueOnce(new Error('still blocked again'))
      .mockResolvedValueOnce(LoadedComponent);

    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter(
          [
            {
              path: 'lazy',
              loadComponent: () =>
                loadRouteWithRetry(loader, 'component', 'lazy'),
            },
          ],
          withRouteLoadError({
            component: LoadErrorComponent,
            componentDeps: {},
            retry: { attempts: 1, delayMs: 0 },
          }),
        ),
      ],
    });

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/lazy');
    expect(loader).toHaveBeenCalledTimes(2);

    await TestBed.inject(CRAFT_ROUTE_LOAD_RECOVERY).retry();
    expect(loader).toHaveBeenCalledTimes(4);
    expect(
      router.routerState.snapshot.root.firstChild?.routeConfig?.path,
    ).toBe(CRAFT_ROUTE_LOAD_ERROR_PATH);

    await TestBed.inject(CRAFT_ROUTE_LOAD_RECOVERY).retry();

    expect(loader).toHaveBeenCalledTimes(5);
    expect(
      router.routerState.snapshot.root.firstChild?.routeConfig?.path,
    ).toBe('lazy');
  });
});
