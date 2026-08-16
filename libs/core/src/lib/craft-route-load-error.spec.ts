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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CRAFT_ROUTE_LOAD_ERROR,
  CRAFT_ROUTE_LOAD_ERROR_CODE,
  CRAFT_ROUTE_DYNAMIC_IMPORT,
  CRAFT_ROUTE_LOAD_RECOVERY,
  CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
  CRAFT_ROUTE_LOAD_ERROR_PATH,
  CRAFT_ROUTE_LOAD_RETRY,
  createRouteLoadRetry,
  isCraftRouteLoadError,
  loadRouteWithRetry,
  provideRouteLoadErrorComponent,
  type CraftRouteLoadRetry,
  withRouteLoadError,
} from './craft-route-load-error';
import { CraftRouteLoadErrorHostComponent } from '@craft-ng/angular';
import {
  CRAFT_COMPILED_ROUTES,
  CRAFT_ROUTER,
  provideCraftRouter,
} from './craft-router';
import { createCraftRouterOutletController } from './craft-router-outlet';

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
  function configureDynamicImportRetry(
    dynamicImport: (url: string) => Promise<unknown>,
  ): EnvironmentInjector {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([]),
        {
          provide: CRAFT_ROUTE_LOAD_RETRY,
          useValue: { execute: (loader: () => Promise<unknown>) => loader() },
        },
        { provide: CRAFT_ROUTE_DYNAMIC_IMPORT, useValue: dynamicImport },
      ],
    });
    return TestBed.inject(EnvironmentInjector);
  }

  function retryFailedImport(
    injector: EnvironmentInjector,
    error: Error,
  ): Promise<unknown> {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(({ withRetry }) =>
        withRetry(Promise.reject(error)),
      );
    return runInInjectionContext(injector, () =>
      loadRouteWithRetry(loader, 'component', 'users'),
    );
  }

  it('retries a failed route load once with the injected retry strategy', async () => {
    const retry: CraftRouteLoadRetry = {
      execute: async (loader) => loader(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([]),
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

  it('enables withRetry only for configured retry attempts', async () => {
    const retry: CraftRouteLoadRetry = {
      execute: async (loader) => loader(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([]),
        { provide: CRAFT_ROUTE_LOAD_RETRY, useValue: retry },
      ],
    });
    const injector = TestBed.inject(EnvironmentInjector);
    const initialError = new Error('initial import failed');
    const loader = vi
      .fn()
      .mockImplementationOnce(({ withRetry }) =>
        withRetry(Promise.reject(initialError)),
      )
      .mockImplementationOnce(({ withRetry }) =>
        withRetry(Promise.resolve('loaded')),
      );

    await expect(
      runInInjectionContext(injector, () =>
        loadRouteWithRetry(loader, 'component', 'users'),
      ),
    ).resolves.toBe('loaded');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('extracts Chrome dynamic-import URLs and adds the first retry query', async () => {
    const dynamicImport = vi.fn().mockResolvedValue({ loaded: true });
    const injector = configureDynamicImportRetry(dynamicImport);

    await expect(
      retryFailedImport(
        injector,
        new TypeError(
          'Failed to fetch dynamically imported module: http://localhost:3000/chunk-users.js',
        ),
      ),
    ).resolves.toEqual({ loaded: true });
    expect(dynamicImport).toHaveBeenCalledWith(
      'http://localhost:3000/chunk-users.js?__craft_route_retry=1',
    );
  });

  it('increments the retry query and preserves existing query params', async () => {
    const dynamicImport = vi
      .fn()
      .mockRejectedValueOnce(new Error('retry failed'))
      .mockResolvedValueOnce({ loaded: true });
    const injector = configureDynamicImportRetry(dynamicImport);
    const error = new TypeError(
      'Failed to fetch dynamically imported module: http://localhost:3000/chunk-query.js?lang=fr',
    );

    await expect(retryFailedImport(injector, error)).rejects.toMatchObject({
      payload: { cause: expect.objectContaining({ message: 'retry failed' }) },
    });
    await expect(retryFailedImport(injector, error)).resolves.toEqual({
      loaded: true,
    });
    expect(dynamicImport).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/chunk-query.js?lang=fr&__craft_route_retry=1',
    );
    expect(dynamicImport).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/chunk-query.js?lang=fr&__craft_route_retry=2',
    );
  });

  it('refuses to retry a cross-origin dynamic-import URL', async () => {
    const dynamicImport = vi.fn();
    const injector = configureDynamicImportRetry(dynamicImport);
    const error = new TypeError(
      'Failed to fetch dynamically imported module: https://cdn.example/chunk.js',
    );

    await expect(retryFailedImport(injector, error)).rejects.toMatchObject({
      payload: { cause: error },
    });
    expect(dynamicImport).not.toHaveBeenCalled();
  });

  it('reuses a successful retried import for the same failed URL', async () => {
    const loadedModule = { loaded: true };
    const dynamicImport = vi.fn().mockResolvedValue(loadedModule);
    const injector = configureDynamicImportRetry(dynamicImport);
    const error = new TypeError(
      'Failed to fetch dynamically imported module: http://localhost:3000/chunk-cached.js',
    );

    await expect(retryFailedImport(injector, error)).resolves.toBe(
      loadedModule,
    );
    await expect(retryFailedImport(injector, error)).resolves.toBe(
      loadedModule,
    );
    expect(dynamicImport).toHaveBeenCalledTimes(1);
  });

  it('removes a failed retried import from the success cache', async () => {
    const dynamicImport = vi
      .fn()
      .mockRejectedValueOnce(new Error('retry failed'))
      .mockResolvedValueOnce({ loaded: true });
    const injector = configureDynamicImportRetry(dynamicImport);
    const error = new TypeError(
      'Failed to fetch dynamically imported module: http://localhost:3000/chunk-evicted.js',
    );

    await expect(retryFailedImport(injector, error)).rejects.toBeDefined();
    await expect(retryFailedImport(injector, error)).resolves.toEqual({
      loaded: true,
    });
    expect(dynamicImport).toHaveBeenCalledTimes(2);
  });

  it('falls back to the original error when its message has no import URL', async () => {
    const dynamicImport = vi.fn();
    const injector = configureDynamicImportRetry(dynamicImport);
    const error = new TypeError('Import failed without a URL');

    await expect(retryFailedImport(injector, error)).rejects.toMatchObject({
      payload: { cause: error },
    });
    expect(dynamicImport).not.toHaveBeenCalled();
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
        provideCraftRouter([]),
        { provide: CRAFT_ROUTE_LOAD_RETRY, useValue: retry },
      ],
    });
    const injector = TestBed.inject(EnvironmentInjector);
    const loader = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new Error('still broken'));

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
    await promise.catch((error) =>
      expect(isCraftRouteLoadError(error)).toBe(true),
    );
  });

  it('resolves local component and retry overrides from a route injector', () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([]),
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

  it('injects CraftRouteLoadRecovery without Angular Router', () => {
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

    expect(() => TestBed.inject(CRAFT_ROUTE_LOAD_RECOVERY)).not.toThrow();
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

    const route = TestBed.inject(CRAFT_COMPILED_ROUTES).find(
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

  it('manual retry re-enters the failing target route', async () => {
    window.history.replaceState(null, '', '/');
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

    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    const router = TestBed.inject(CRAFT_ROUTER);
    await router.navigateByUrl('/lazy');
    await flushMicrotasks();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(outlet.state()).toBe('error');
    expect(TestBed.inject(CRAFT_ROUTE_LOAD_ERROR)()?.payload.targetUrl).toBe(
      '/lazy',
    );

    await TestBed.inject(CRAFT_ROUTE_LOAD_RECOVERY).retry();
    await flushMicrotasks();

    expect(loader).toHaveBeenCalledTimes(3);
    expect(router.url).toBe('/lazy');
    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(LoadedComponent);
    window.history.replaceState(null, '', '/');
  });

  it('manual retry keeps the original target after another retry failure', async () => {
    window.history.replaceState(null, '', '/');
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

    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    const router = TestBed.inject(CRAFT_ROUTER);
    await router.navigateByUrl('/lazy');
    await flushMicrotasks();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(outlet.state()).toBe('error');

    await TestBed.inject(CRAFT_ROUTE_LOAD_RECOVERY).retry();
    await flushMicrotasks();
    expect(loader).toHaveBeenCalledTimes(4);
    expect(outlet.state()).toBe('error');
    expect(router.url).toBe('/lazy');

    await TestBed.inject(CRAFT_ROUTE_LOAD_RECOVERY).retry();
    await flushMicrotasks();

    expect(loader).toHaveBeenCalledTimes(5);
    expect(outlet.state()).toBe('loaded');
    expect(outlet.targetComponent()).toBe(LoadedComponent);
    window.history.replaceState(null, '', '/');
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}
