import {
  ApplicationInitStatus,
  InjectionToken,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { craftAppConfig, toApplicationConfig } from './craft-app-config';
import {
  appStartCalls,
  requiredAppStart,
} from './craft-app-config.app-start.fixture';
import type { AppProvidedServiceNamesOf } from './route-checked-di';
import {
  craftService,
  onAppStart,
  runServiceAppStart,
} from './craft-service';
import { craftUse } from './craft-use';

describe('craftAppConfig', () => {
  it('should not accept route metadata through the app config', () => {
    // @ts-expect-error Route metadata belongs to the craftRoutes collection.
    craftAppConfig({ routingDeps: [] as const });
  });

  it('should ignore plain Angular providers when extracting Craft provider names', () => {
    const { provideCounter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      () => 1,
    );
    const token = new InjectionToken<string>('plain-provider');

    const _appConfig = craftAppConfig({
      appStart: requiredAppStart,
      providers: [
        { provide: token, useValue: 'value' },
        provideCounter(),
      ] as const,
    });

    type ProvidedNames = AppProvidedServiceNamesOf<typeof _appConfig>;

    expectTypeOf<ProvidedNames>().toEqualTypeOf<'Counter' | 'AppStartCounter'>();
  });

  it('should convert to ApplicationConfig', () => {
    const marker = new InjectionToken<string>('marker');
    const appConfig = craftAppConfig({
      appStart: requiredAppStart,
      providers: [
        {
          provide: marker,
          useValue: 'kept',
        },
      ] as const,
    });

    const applicationConfig = toApplicationConfig(appConfig);

    expect(applicationConfig.providers).toEqual(appConfig.providers);
    expect(applicationConfig.providers).not.toBe(appConfig.providers);
  });
});

describe('craftAppConfig appStart', () => {
  it('should run registered appStart services during app initialization', async () => {
    appStartCalls.length = 0;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ...craftAppConfig({
          appStart: requiredAppStart,
        }).providers,
      ],
    });

    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(appStartCalls).toEqual(['started']);
  });

  it('should run generator-based appStart callbacks during app initialization', async () => {
    const generatorAppStartCalls: string[] = [];
    let resolveAppStart!: () => void;
    const waitForAppStart = new Promise<void>((resolve) => {
      resolveAppStart = resolve;
    });

    craftService(
      {
        name: 'GeneratorAppStart',
        providedIn: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          generatorAppStartCalls.push('generator-started');
          return waitForAppStart;
        });

        return 1;
      },
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ...craftAppConfig({
          appStart: requiredAppStart,
        }).providers,
      ],
    });

    const pendingInitialization = TestBed.inject(
      ApplicationInitStatus,
    ).donePromise;

    expect(generatorAppStartCalls).toEqual(['generator-started']);

    resolveAppStart();
    await pendingInitialization;
  });

  it('should reject nested onAppStart declarations inside generator callbacks', () => {
    const { NestedAppStart } = craftService(
      {
        name: 'NestedAppStart',
        providedIn: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(function* () {
          yield* onAppStart(() => undefined) as Generator<any, void, unknown>;

          return undefined;
        });

        return 1;
      },
    );

    TestBed.runInInjectionContext(() => {
      const service = craftUse(NestedAppStart());

      expect(() => runServiceAppStart(NestedAppStart, service)).toThrow(
        'onAppStart(...) generator callbacks cannot declare onAppStart(...) recursively.',
      );
    });
  });
});
