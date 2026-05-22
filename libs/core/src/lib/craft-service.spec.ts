import { TestBed } from '@angular/core/testing';
import { state } from './state';
import { inject, InjectionToken, signal } from '@angular/core';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Subject } from 'rxjs';
import { Console, ConsoleServiceToYield } from './browser-boundaries';
import {
  abstract,
  craftRequirement,
  craftService,
  getServiceMetaData,
  onAppStart,
  runServiceAppStart,
  toValue,
} from './craft-service';
import type {
  GetInjectedServiceDependencies,
  GetServiceReferenceMeta,
  GetServiceOutput,
  GetServiceYields,
  GetServiceTrackingMetadata,
  GetToYieldServiceDependencies,
  MaybeSignal,
} from './craft-service';
import { provideFnWrapper, type FnWrapper } from './fn-wrapper';
import type { ExtractDeps } from './branded-component/branded-component';
import { query } from './query';
import { CraftHttpClient } from './craft-http-client';

// todo later ne pas passer d'input et passer une dérivation inject...

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

describe('craftService', () => {
  it('should enable to create a craftService-like using craftService and inject it.', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should expose browserBoundary in runtime metadata and preserve literal typing', () => {
    const {
      injectBrowserCounter,
      BrowserCounterToYield,
      BROWSER_COUNTER_META_DATA,
    } = craftService(
      {
        name: 'BrowserCounter',
        scope: 'global',
        browserBoundary: true,
      },
      () => state(0),
    );

    const { injectDefaultCounter, DEFAULT_COUNTER_META_DATA } = craftService(
      { name: 'DefaultCounter', scope: 'global' },
      () => state(0),
    );

    expect(BROWSER_COUNTER_META_DATA.browserBoundary).toBe(true);
    expect(DEFAULT_COUNTER_META_DATA.browserBoundary).toBe(false);
    expect(getServiceMetaData(injectBrowserCounter).browserBoundary).toBe(true);
    expect(getServiceMetaData(injectDefaultCounter).browserBoundary).toBe(
      false,
    );

    expectTypeOf(
      BROWSER_COUNTER_META_DATA.browserBoundary,
    ).toEqualTypeOf<true>();
    expectTypeOf(
      DEFAULT_COUNTER_META_DATA.browserBoundary,
    ).toEqualTypeOf<false>();
    expectTypeOf<
      GetServiceReferenceMeta<typeof injectBrowserCounter>['browserBoundary']
    >().toEqualTypeOf<true>();
    expectTypeOf<
      GetServiceTrackingMetadata<
        typeof BrowserCounterToYield
      >['browserBoundary']
    >().toEqualTypeOf<true>();
  });

  it('should expose appStart in runtime metadata and preserve literal typing', async () => {
    let resolveAppStart!: () => void;
    const waitXTime = new Promise<void>((resolve) => {
      resolveAppStart = resolve;
    });
    const calls: string[] = [];

    const { injectAppStartCounter, APP_START_COUNTER_META_DATA } = craftService(
      {
        name: 'AppStartCounter',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(() => {
          calls.push('started');
          return waitXTime;
        });

        return state(0);
      },
    );

    expect(APP_START_COUNTER_META_DATA.appStart).toBe(true);
    expect(getServiceMetaData(injectAppStartCounter).appStart).toBe(true);
    expectTypeOf(APP_START_COUNTER_META_DATA.appStart).toEqualTypeOf<true>();
    expectTypeOf<
      GetServiceReferenceMeta<typeof injectAppStartCounter>['appStart']
    >().toEqualTypeOf<true>();
    expectTypeOf<
      GetServiceTrackingMetadata<typeof injectAppStartCounter>['appStart']
    >().toEqualTypeOf<true>();
    expectTypeOf<
      GetInjectedServiceDependencies<typeof injectAppStartCounter>['appStart']
    >().toEqualTypeOf<true>();

    await TestBed.runInInjectionContext(async () => {
      const service = injectAppStartCounter();
      const pendingStart = runServiceAppStart(injectAppStartCounter, service);

      expect(calls).toEqual(['started']);
      expect(
        runServiceAppStart(injectAppStartCounter, service),
      ).toBeUndefined();

      resolveAppStart();
      await pendingStart;
    });
  });

  it('should support generator callbacks in onAppStart and wait for their async result', async () => {
    let resolveAppStart!: () => void;
    const waitForAppStart = new Promise<void>((resolve) => {
      resolveAppStart = resolve;
    });
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { injectAppStartLog } = craftService(
      {
        name: 'AppStartLog',
        scope: 'global',
        appStart: true,
      },
      function* () {
        yield* onAppStart(function* () {
          yield* Console.log('This is a log from the appStart callback');
          return waitForAppStart;
        });

        return 1;
      },
    );

    await TestBed.runInInjectionContext(async () => {
      const service = injectAppStartLog();
      const pendingStart = runServiceAppStart(injectAppStartLog, service);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'This is a log from the appStart callback',
        expect.objectContaining({
          from: ['AppStartLog'],
          trace: expect.any(String),
        }),
      );

      resolveAppStart();
      await pendingStart;
    });
  });

  it('feedback-1: it should be allow', () => {
    type User = {
      id: string;
      name: string;
    };
    craftService(
      {
        name: 'ApiService',
        scope: 'global',
        appStart: true,
      },
      function* () {
        const userQuery = query({
          method: (emptyPayload: string) => emptyPayload,
          loader: function* () {
            return yield* CraftHttpClient.get(({ response }) => ({
              url: '/api/auth/me',
              success: response<User | undefined>(),
              exceptions: [],
            }));
          },
        });
        yield* onAppStart(() => void userQuery.call('go'));
        return userQuery;
      },
    );
  });

  it('should track dependencies yielded only inside onAppStart generator callbacks', () => {
    if (false) {
      type ConsoleAppStartYield = GetServiceYields<
        typeof ConsoleServiceToYield
      >;

      const { injectTypedAppStartLog } = craftService(
        {
          name: 'TypedAppStartLog',
          scope: 'toProvide',
          appStart: true,
        },
        function* () {
          yield* onAppStart(function* (): Generator<
            ConsoleAppStartYield,
            undefined,
            unknown
          > {
            const consoleService = yield* ConsoleServiceToYield();

            consoleService.log('typed app start log');

            return undefined;
          });

          return 1;
        },
      );

      type AppStartLogDependencies = GetInjectedServiceDependencies<
        typeof injectTypedAppStartLog
      >;
      type ConsoleDependency =
        AppStartLogDependencies['dependencies']['ConsoleService'];

      expectTypeOf<
        AppStartLogDependencies['scope']
      >().toEqualTypeOf<'toProvide'>();
      expectTypeOf<
        AppStartLogDependencies['browserBoundary']
      >().toEqualTypeOf<false>();
      expectTypeOf<AppStartLogDependencies['appStart']>().toEqualTypeOf<true>();
      expectTypeOf<ConsoleDependency['scope']>().toEqualTypeOf<'global'>();
      expectTypeOf<
        ConsoleDependency['browserBoundary']
      >().toEqualTypeOf<true>();
      expectTypeOf<ConsoleDependency['appStart']>().toEqualTypeOf<false>();
      expectTypeOf<ConsoleDependency['dependencies']>().toEqualTypeOf<{}>();
    }
  });

  it('should fail at runtime when onAppStart is used without appStart: true', () => {
    const { injectInvalidAppStart } = craftService(
      { name: 'InvalidAppStart', scope: 'global' },
      function* () {
        yield* onAppStart(() => undefined);
        return 1;
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(() => injectInvalidAppStart()).toThrow(
        'craftService("InvalidAppStart") used onAppStart(...) without enabling appStart: true.',
      );
    });
  });

  it('should enable to yield another craftService', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield();

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
      counter.incrementTwice();
      expect(counter()).toBe(3);
    });
  });

  // todo later eslint rule to block inject inside craftService
});
describe('scope', () => {
  it('should enable to create a global craftService by passing a name/scope', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should not expose provideCounter for craftService with global scope', () => {
    //@ts-expect-error provideCounter should not be defined for global craftService because it is provided automatically, it should not be possible to provide it manually
    const { injectCounter, provideCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    expect(provideCounter).toBeUndefined();
  });

  // todo global craftService should not expose provideService

  it('should enable to create a global craftService by passing a name/scope', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to create a toProvide craftService by passing a name/scope', () => {
    const { injectCounter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.configureTestingModule({
      providers: [provideCounter()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should expose provider config through $provided for a toProvide craftService while keeping public bindings separate', () => {
    const { injectCounter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { $provided: { initialValue: number }; step: number }) =>
        state(inputs.$provided.initialValue, ({ update }) => ({
          increment: () => update((value) => value + inputs.step),
          readStep: () => inputs.step,
          readProvidedInitialValue: () => inputs.$provided.initialValue,
        })),
    );

    TestBed.configureTestingModule({
      providers: [provideCounter({ initialValue: 10 })],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter({ step: 2 });

      expect(counter()).toBe(10);
      expect(counter.readStep()).toBe(2);
      expect(counter.readProvidedInitialValue()).toBe(10);

      counter.increment();
      expect(counter()).toBe(12);
    });
  });

  it('should enable to create a manuallyProvidedAtRoot craftService by passing a name/scope', () => {
    // for services that need to be provided at root but with some specific configuration (like inputs) that make it impossible to provide them with the provideService helper (or for external services like HttpClient)
    // the aim of this scope is to enable to inject it in global services while still exposing a public token for manual root providers
    const { injectCounter, provideCounter, CounterToProvide } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    expect(CounterToProvide).toBeInstanceOf(InjectionToken);

    TestBed.configureTestingModule({
      providers: [provideCounter()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should expose provider config through $provided for a manuallyProvidedAtRoot craftService', () => {
    const { injectCounter, provideCounter, CounterToProvide } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      (inputs: { $provided: { initialValue: number } }) =>
        state(inputs.$provided.initialValue, ({ update }) => ({
          increment: () => update((value) => value + 1),
          readProvidedInitialValue: () => inputs.$provided.initialValue,
        })),
    );

    TestBed.configureTestingModule({
      providers: [provideCounter({ initialValue: 7 })],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      const providedCounter = inject(CounterToProvide);

      expect(counter).toBe(providedCounter);
      expect(counter()).toBe(7);
      expect(counter.readProvidedInitialValue()).toBe(7);
    });
  });

  it('should enable to manually provide a manuallyProvidedAtRoot craftService through CounterToProvide', () => {
    const { injectCounter, CounterToProvide } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    const manualCounter = state(10, ({ update }) => ({
      increment: () => update((v) => v + 1),
    }));

    TestBed.configureTestingModule({
      providers: [{ provide: CounterToProvide, useValue: manualCounter }],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
    });
  });

  it('should enable to create a function craftService by passing a name/scope (mostly used for reusability and composition/inputs...)', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'function' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should only allow $provided on provider-capable scopes', () => {
    if (false) {
      craftService(
        { name: 'Counter', scope: 'global' },
        //@ts-expect-error $provided should stay reserved to toProvide/manuallyProvidedAtRoot craftService scopes
        (inputs: { $provided: { initialValue: number } }) =>
          state(inputs.$provided.initialValue),
      );
    }

    if (false) {
      craftService(
        { name: 'Counter', scope: 'function' },
        //@ts-expect-error $provided should stay reserved to toProvide/manuallyProvidedAtRoot craftService scopes
        (inputs: { $provided: { initialValue: number } }) =>
          state(inputs.$provided.initialValue),
      );
    }
  });

  it('should enable to create an abstract craftService by passing a name/scope', () => {
    interface Counter {
      (): number;
      increment(): void;
    }
    const counterService = craftService(
      { name: 'Counter', scope: 'abstract' },
      abstract<Counter>(), // todo create abstract helper that just return the type and do nothing else, to be used for abstract craftService
    );
    const { injectCounter } = counterService;

    expectTypeOf(injectCounter).toEqualTypeOf<() => Counter>();
    expect(injectCounter).toBeDefined();

    //@ts-expect-error provideCounter should not be defined because it's an abstract craftService, an implementation craftService should provide through requirement CounterRequirement
    const { provideCounter } = counterService;
    expect(provideCounter).toBeUndefined();
  });

  it('should enable to create a craftService from an abstract craftService through requirement (It should provide the implementation craftService and abstract craftService)', () => {
    const { injectCounter, CounterRequirement } = craftService(
      { name: 'Counter', scope: 'abstract' },
      abstract<{
        (): number;
        increment(): void;
      }>(),
    );

    // todo CounterRequirement should only be exposed when scope: 'abstract' is set

    // todo when creating from requirement: CounterRequirement it should not be possible to create a global (to force to provide it ?) non
    const { injectCounterImpl, provideCounterImpl } = craftService(
      {
        name: 'CounterImpl',
        scope: 'toProvide',
        requirement: CounterRequirement,
      },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    // todo provideCounterImpl should provide CounterImpl and the source of CounterRequirement

    TestBed.configureTestingModule({
      providers: [provideCounterImpl()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);

      const counterImpl = injectCounterImpl();
      expect(counterImpl()).toBe(1);
    });
  });

  it('should enable to create a craftService from craftRequirement inline', () => {
    interface Counter {
      (): number;
      increment(): void;
    }

    const { injectCounterImpl, provideCounterImpl } = craftService(
      {
        name: 'CounterImpl',
        scope: 'toProvide',
        requirement: craftRequirement<Counter>(),
      },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.configureTestingModule({
      providers: [provideCounterImpl()],
    });

    TestBed.runInInjectionContext(() => {
      const counterImpl = injectCounterImpl();
      expect(counterImpl()).toBe(0);
      counterImpl.increment();
      expect(counterImpl()).toBe(1);
    });
  });

  it('should allow an inline craftRequirement with a named interface contract', () => {
    interface Counter {
      increment(): void;
    }

    const increment = vi.fn();
    const { injectCounterImpl, provideCounterImpl } = craftService(
      {
        name: 'CounterImpl',
        scope: 'toProvide',
        requirement: craftRequirement<Counter>(),
      },
      () => ({
        increment,
      }),
    );

    TestBed.configureTestingModule({
      providers: [provideCounterImpl()],
    });

    TestBed.runInInjectionContext(() => {
      const counterImpl = injectCounterImpl();
      counterImpl.increment();
      expect(increment).toHaveBeenCalledTimes(1);
    });
  });

  it('should expose a token on craftRequirement that aliases the concrete instance', () => {
    interface Counter {
      (): number;
      increment(): void;
    }

    const CounterRequirement = craftRequirement<Counter>();
    const { injectCounterImpl, provideCounterImpl } = craftService(
      {
        name: 'CounterImpl',
        scope: 'toProvide',
        requirement: CounterRequirement,
      },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    expect(CounterRequirement.token).toBeInstanceOf(InjectionToken);

    TestBed.configureTestingModule({
      providers: [provideCounterImpl()],
    });

    TestBed.runInInjectionContext(() => {
      const counterImpl = injectCounterImpl();
      const counter = inject(CounterRequirement.token);

      expect(counter).toBe(counterImpl);
      counter.increment();
      expect(counterImpl()).toBe(1);
    });
  });

  it('should not enable to create a global craftService from an abstract craftService', () => {
    const { CounterRequirement } = craftService(
      { name: 'Counter', scope: 'abstract' },
      abstract<{
        (): number;
        increment(): void;
      }>(),
    );

    craftService(
      {
        name: 'CounterImpl',
        scope: 'global',
        //@ts-expect-error it should not be possible to create a global craftService from an abstract craftService, it should force to provide an implementation
        requirement: CounterRequirement,
      },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );
  });

  it('should not enable to create a craftService implementation from an abstract craftService if the requirement is not satisfied', () => {
    const { CounterRequirement } = craftService(
      { name: 'Counter', scope: 'abstract' },
      abstract<{
        (): number;
        increment(): void;
      }>(),
    );

    craftService(
      {
        name: 'CounterImpl',
        scope: 'global',
        //@ts-expect-error it should not be possible to create a craftService if the requirement is not satisfied,
        requirement: CounterRequirement,
      },
      () => state(0),
    );
  });

  it('should not enable to create a global craftService from craftRequirement inline', () => {
    if (false) {
      craftService(
        {
          name: 'CounterImpl',
          scope: 'global',
          //@ts-expect-error it should not be possible to create a global craftService from craftRequirement, it should force to provide an implementation
          requirement: craftRequirement<{
            increment(): void;
          }>(),
        },
        () => ({
          increment: () => undefined,
        }),
      );
    }
  });

  it('should not enable to create a craftService from craftRequirement inline if the contract is not satisfied', () => {
    if (false) {
      craftService(
        {
          name: 'CounterImpl',
          scope: 'toProvide',
          //@ts-expect-error it should not be possible to create a craftService if the craftRequirement contract is not satisfied
          requirement: craftRequirement<{
            increment(): void;
          }>(),
        },
        () => state(0),
      );
    }
  });

  it('should not enable to create a global craftService that depends on a toProvide craftService', () => {
    const { injectCounter, provideCounter, CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    //@ts-expect-error it should not be possible to create a global craftService that depends on a toProvide craftService because the dependency cannot be resolved, it should force to provide the craftService in the test or use manuallyProvidedAtRoot for the craftService that need to be yield in a global craftService
    craftService({ name: 'GlobalCounter', scope: 'global' }, function* () {
      const counter = yield* CounterToYield();
      return counter;
    });
  });

  it('should enable to create a global craftService that depends on a manuallyProvidedAtRoot craftService', () => {
    const { provideCounter, CounterToYield } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    const { injectGlobalCounter } = craftService(
      { name: 'GlobalCounter', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield();
        return counter;
      },
    );

    TestBed.configureTestingModule({
      providers: [provideCounter()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectGlobalCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });
});

describe('injectService should enable to binding inputs', () => {
  it('should keep $provided private from inject helpers and preserve the provider value at runtime', () => {
    const { injectCounter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { $provided: { initialValue: number }; step: number }) =>
        state(inputs.$provided.initialValue, ({ update }) => ({
          increment: () => update((value) => value + inputs.step),
        })),
    );

    TestBed.configureTestingModule({
      providers: [provideCounter({ initialValue: 10 })],
    });

    if (false) {
      //@ts-expect-error $provided should not be a public inject binding
      injectCounter({
        step: 2,
        $provided: { initialValue: 99 },
      });
    }

    TestBed.runInInjectionContext(() => {
      const counter = Reflect.apply(injectCounter, undefined, [
        {
          step: 2,
          $provided: { initialValue: 99 },
        },
      ]);

      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(12);
    });
  });

  it('should enable to bind a signal input', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })), // todo create toValue helper
    );

    TestBed.runInInjectionContext(() => {
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = injectCounter({ initialValue: 0 });
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to bind an optional signal input and not bind an optional input', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
        optionalProperty1?: MaybeSignal<number>; // todo create MaybeSignal
        optionalProperty2?: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })), // todo create toValue helper
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter({ initialValue: 0, optionalProperty1: 0 });
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to bind a signal input', () => {
    // todoBefore mettre inputs/method ? pour simpliéfier le binding ? et permet de rajouter un provide plus tard
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    TestBed.runInInjectionContext(() => {
      const initialValue = signal(0);
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = injectCounter({ initialValue });
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should return a string as an error "Inputs Error, xxx is not provided" if an input is not provided', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    TestBed.runInInjectionContext(() => {
      expect(() => injectCounter()).toThrow(
        'Inputs Error, initialValue is not provided',
      );
    });
  });
  it('should provide a string token to say that the input is already provided', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    TestBed.runInInjectionContext(() => {
      const initialValue = signal(0);
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = injectCounter({ initialValue });
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });

    TestBed.runInInjectionContext(() => {
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = injectCounter({
        initialValue: 'Provided elsewhere #warn-check-docs:inputs',
      });
      expect(counter()).toBe(1);
      counter.increment();
      expect(counter()).toBe(2);
    });
  });
});

// todoBefore generatrice aussi
describe('serviceToYield should enable to binding inputs', () => {
  it('should keep $provided private from yield helpers', () => {
    const { CounterToYield, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { $provided: { initialValue: number }; step: number }) =>
        state(inputs.$provided.initialValue, ({ update }) => ({
          increment: () => update((value) => value + inputs.step),
        })),
    );

    const { injectCounterExtended, provideCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield({ step: 2 });

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    // eslint-disable-next-line no-constant-condition
    if (false) {
      //@ts-expect-error $provided should not be a public CounterToYield binding
      CounterToYield({
        step: 2,
        $provided: { initialValue: 99 },
      });
    }

    TestBed.configureTestingModule({
      providers: [
        provideCounter({ initialValue: 10 }),
        provideCounterExtended(),
      ],
    });

    TestBed.runInInjectionContext(() => {
      const counterExtended = injectCounterExtended();

      expect(counterExtended.read()).toBe(10);
      counterExtended.increment();
      expect(counterExtended.read()).toBe(12);
    });
  });

  it('should enable to bind a raw input', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield({ initialValue: 10 });

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
      counter.incrementTwice();
      expect(counter()).toBe(13);
    });
  });

  it('should enable to bind a signal input', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield({ initialValue: signal(10) });

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
      counter.incrementTwice();
      expect(counter()).toBe(13);
    });
  });

  it('should enable to bind an optional input and not bind an optional input', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>;
        optionalProperty1?: MaybeSignal<number>; // todo create MaybeSignal
        optionalProperty2?: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield({
          initialValue: signal(10),
          optionalProperty1: signal(20),
        });

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
      counter.incrementTwice();
      expect(counter()).toBe(13);
    });
  });

  it('should return a string as an error "Inputs Error, xxx is not provided" if an input is not provided or blocks the yield', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* CounterToYield();
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(() => injectCounterExtended()).toThrow(
        'Inputs Error, initialValue is not provided',
      );
    });
  });
  it('should provide a string token to say that the input is already provided', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter1 = yield* CounterToYield({ initialValue: signal(10) });
        // todobefore it is possible to yield the same craftService twice ?
        const counter2 = yield* CounterToYield({
          initialValue: 'Provided elsewhere #warn-check-docs:inputs',
        });

        return Object.assign(counter1, {
          incrementTwice: () => {
            counter1.increment();
            counter1.increment();
          },
          counter2,
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
      counter.incrementTwice();
      expect(counter()).toBe(13);
    });
  });

  it('should enable to yield a craftService with the scope function several times that will generate different instances', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter1 = yield* CounterToYield({
          initialValue: signal(10),
        });
        const counter2 = yield* CounterToYield({
          initialValue: signal(20),
        });

        return {
          counter1,
          counter2,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounterExtended();
      expect(counterHandler.counter1()).toBe(10);
      counterHandler.counter1.increment();
      expect(counterHandler.counter1()).toBe(11);
      expect(counterHandler.counter2()).toBe(20);
      counterHandler.counter2.increment();
      expect(counterHandler.counter2()).toBe(21);
    });
  });
});

describe('injectService/ServiceToYield should expose an optional parameter that can be used to only expose what is needed and yield* dep must be used to declare non exposed fields. “Any dependency that is used but not exposed must be yielded (with yield*) in order to be counted.”', () => {
  it('should enable to explicitly re-expose the root callable when using injectCounter', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounter({}, ({ $self, increment }) => ({
        $self,
        increment,
      }));

      //@ts-expect-error decrement should not be accessible because it is not exposed
      expect(counterHandler.decrement).toBeUndefined();

      //@ts-expect-error $self should not be accessible because it is merged back at the root
      expect(counterHandler.$self).toBeUndefined();

      expect('decrement' in counterHandler).toBe(false);
      expect('$self' in counterHandler).toBe(false);
      expect(counterHandler()).toBe(10);
      counterHandler.increment();
      expect(counterHandler()).toBe(11);
    });
  });

  it('should enable to track hidden dependencies when using injectCounter', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      () => {
        const counter = state(10, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        }));

        return {
          state: counter,
          increment: counter.increment,
          decrement: counter.decrement,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const triggerDecrementObservable = new Subject<void>();
      const counterHandler = injectCounter(
        {},
        function* ({ state, increment, decrement }) {
          const decrementRef = yield* decrement();
          triggerDecrementObservable.subscribe(() => decrementRef());

          return {
            state,
            increment,
          };
        },
      );

      //@ts-expect-error decrement should not be accessible because it is not exposed
      expect(counterHandler.decrement).toBeUndefined();

      expect('decrement' in counterHandler).toBe(false);
      expect(counterHandler.state()).toBe(10);
      counterHandler.increment();
      expect(counterHandler.state()).toBe(11);
      triggerDecrementObservable.next();
      expect(counterHandler.state()).toBe(10);
    });
  });

  it('should enable to track hidden dependencies from ServiceToYield', () => {
    const triggerDecrementObservable = new Subject<void>();

    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) => {
        const counter = state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        }));

        return {
          state: counter,
          increment: counter.increment,
          decrement: counter.decrement,
        };
      },
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* CounterToYield(
          {
            initialValue: signal(10),
          },
          function* ({ state, increment, decrement }) {
            const decrementRef = yield* decrement();
            triggerDecrementObservable.subscribe(() => decrementRef());

            return {
              state,
              increment,
            };
          },
        );
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounterExtended();

      //@ts-expect-error decrement should not be accessible because it is not exposed
      expect(counterHandler.decrement).toBeUndefined();

      expect('decrement' in counterHandler).toBe(false);
      expect(counterHandler.state()).toBe(10);
      counterHandler.increment();
      expect(counterHandler.state()).toBe(11);
      triggerDecrementObservable.next();
      expect(counterHandler.state()).toBe(10);
    });
  });

  it('should enable ToYield single-property shortcuts to return a derived property', async () => {
    type User = {
      id: string;
      name: string;
    };

    const users = signal<User[]>([{ id: '1', name: 'Romain' }]);

    const { SinglePropertyShortcutApiToYield } = craftService(
      { name: 'SinglePropertyShortcutApi', scope: 'global' },
      () => ({
        users,
        updateItem: async (updatedUser: User) => {
          users.set(
            users().map((user) =>
              user.id === updatedUser.id ? updatedUser : user,
            ),
          );
          return updatedUser;
        },
      }),
    );

    const { injectSinglePropertyShortcutConsumer } = craftService(
      { name: 'SinglePropertyShortcutConsumer', scope: 'global' },
      function* () {
        const updateItem = yield* SinglePropertyShortcutApiToYield.updateItem();

        expectTypeOf(updateItem).toEqualTypeOf<
          GetServiceOutput<
            typeof SinglePropertyShortcutApiToYield
          >['updateItem']
        >();

        return {
          updateItem,
        };
      },
    );

    expect(
      getServiceMetaData(SinglePropertyShortcutApiToYield.updateItem).name,
    ).toBe('SinglePropertyShortcutApi');

    type ConsumerDependencies = GetInjectedServiceDependencies<
      typeof injectSinglePropertyShortcutConsumer
    >;

    expectTypeOf<ConsumerDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {
        SinglePropertyShortcutApi: {
          scope: 'global';
          browserBoundary: false;
          appStart: false;
          dependencies: {};
          derivedPropertiesUsed: {
            updateItem: GetServiceOutput<
              typeof SinglePropertyShortcutApiToYield
            >['updateItem'];
          };
          derivedPropertiesExposed: {
            updateItem: GetServiceOutput<
              typeof SinglePropertyShortcutApiToYield
            >['updateItem'];
          };
        };
      };
    }>();

    await TestBed.runInInjectionContext(async () => {
      const consumer = injectSinglePropertyShortcutConsumer();

      await expect(
        consumer.updateItem({ id: '1', name: 'Geffrault' }),
      ).resolves.toEqual({ id: '1', name: 'Geffrault' });
      expect(users()).toEqual([{ id: '1', name: 'Geffrault' }]);
    });
  });

  it('should enable ToYield method shortcuts to call a derived method directly when the service has no public inputs', async () => {
    type User = {
      id: string;
      name: string;
    };

    const users = signal<User[]>([{ id: '1', name: 'Romain' }]);

    const { DirectMethodShortcutApiToYield } = craftService(
      { name: 'DirectMethodShortcutApi', scope: 'global' },
      () => ({
        updateItem: async (updatedUser: User) => {
          users.set(
            users().map((user) =>
              user.id === updatedUser.id ? updatedUser : user,
            ),
          );
          return updatedUser;
        },
      }),
    );

    const { injectDirectMethodShortcutConsumer } = craftService(
      { name: 'DirectMethodShortcutConsumer', scope: 'global' },
      function* () {
        const result = yield* DirectMethodShortcutApiToYield.updateItem({
          id: '1',
          name: 'Geffrault',
        });

        expectTypeOf(result).toEqualTypeOf<
          ReturnType<
            GetServiceOutput<
              typeof DirectMethodShortcutApiToYield
            >['updateItem']
          >
        >();

        return result;
      },
    );

    type ConsumerDependencies = GetInjectedServiceDependencies<
      typeof injectDirectMethodShortcutConsumer
    >;

    expectTypeOf<ConsumerDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {
        DirectMethodShortcutApi: {
          scope: 'global';
          browserBoundary: false;
          appStart: false;
          dependencies: {};
          derivedPropertiesUsed: {
            updateItem: GetServiceOutput<
              typeof DirectMethodShortcutApiToYield
            >['updateItem'];
          };
          derivedPropertiesExposed: {
            updateItem: GetServiceOutput<
              typeof DirectMethodShortcutApiToYield
            >['updateItem'];
          };
        };
      };
    }>();

    await TestBed.runInInjectionContext(async () => {
      await expect(injectDirectMethodShortcutConsumer()).resolves.toEqual({
        id: '1',
        name: 'Geffrault',
      });
      expect(users()).toEqual([{ id: '1', name: 'Geffrault' }]);
    });
  });

  it('should pass bindings to ToYield single-property shortcuts', () => {
    const calls: number[] = [];

    const { InputShortcutCounterToYield } = craftService(
      { name: 'InputShortcutCounter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) => ({
        increment: () => calls.push(toValue(inputs.initialValue) + 1),
      }),
    );

    const { injectInputShortcutCounterConsumer } = craftService(
      { name: 'InputShortcutCounterConsumer', scope: 'global' },
      function* () {
        const increment = yield* InputShortcutCounterToYield.increment({
          initialValue: signal(10),
        });

        expectTypeOf(increment).toEqualTypeOf<
          GetServiceOutput<typeof InputShortcutCounterToYield>['increment']
        >();

        return {
          increment,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const consumer = injectInputShortcutCounterConsumer();

      consumer.increment();

      expect(calls).toEqual([11]);
    });
  });

  it('should not keep the root callable implicitly when using CounterToYield without $self', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const partialCounter = yield* CounterToYield(
          {
            initialValue: signal(10),
          },
          ({ increment }) => ({
            incrementCounter: increment,
          }),
        );

        //@ts-expect-error decrement should not be accessible because it is not exposed
        expect(partialCounter.decrement).toBeUndefined();

        return partialCounter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounterExtended();

      expect('decrement' in counterHandler).toBe(false);
      expect('incrementCounter' in counterHandler).toBe(true);
      //@ts-expect-error counterHandler should not be callable without exposing $self
      expect(() => counterHandler()).toThrow(TypeError);
      counterHandler.incrementCounter();
      //@ts-expect-error counterHandler should not be callable without exposing $self
      expect(() => counterHandler()).toThrow(TypeError);
    });
  });

  it('should enable to explicitly re-expose the root callable when using CounterToYield', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* CounterToYield(
          {
            initialValue: signal(10),
          },
          ({ $self, increment }) => ({
            $self,
            incrementCounter: increment,
          }),
        );
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounterExtended();

      //@ts-expect-error $self should not be accessible because it is merged back at the root
      expect(counterHandler.$self).toBeUndefined();

      expect('$self' in counterHandler).toBe(false);
      expect(counterHandler()).toBe(10);
      counterHandler.incrementCounter();
      expect(counterHandler()).toBe(11);
    });
  });

  it('should enable to track hidden root callable dependencies from ServiceToYield', () => {
    const triggerDecrementObservable = new Subject<void>();

    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* CounterToYield(
          {
            initialValue: signal(10),
          },
          function* ({ $self, increment, decrement }) {
            const stateRef = yield* $self();
            const decrementRef = yield* decrement();

            triggerDecrementObservable.subscribe(() => {
              stateRef();
              decrementRef();
            });

            return {
              $self,
              incrementCounter: increment,
            };
          },
        );
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounterExtended();

      expect(counterHandler()).toBe(10);
      counterHandler.incrementCounter();
      expect(counterHandler()).toBe(11);
      triggerDecrementObservable.next();
      expect(counterHandler()).toBe(10);
    });
  });
});

describe('typing can track all dependencies (direct and child dependencies)', () => {
  it('should enable to track injectCounter global scope', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    type CounterDependencies = GetInjectedServiceDependencies<
      typeof injectCounter
    >;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
    }>();
  });

  it('should enable to track injectCounter scope', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    type CounterDependencies = GetInjectedServiceDependencies<
      typeof injectCounter
    >;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'toProvide';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
    }>();
  });

  it('should preserve browserBoundary on a dependency node', () => {
    const { BrowserStorageToYield } = craftService(
      {
        name: 'BrowserStorage',
        scope: 'global',
        browserBoundary: true,
      },
      () => ({
        read: () => localStorage.getItem('key'),
      }),
    );

    const { injectStorageConsumer } = craftService(
      { name: 'StorageConsumer', scope: 'global' },
      function* () {
        const storage = yield* BrowserStorageToYield();

        return {
          read: () => storage.read(),
        };
      },
    );

    type StorageConsumerDependencies = GetInjectedServiceDependencies<
      typeof injectStorageConsumer
    >;

    expectTypeOf<StorageConsumerDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {
        BrowserStorage: {
          scope: 'global';
          browserBoundary: true;
          appStart: false;
          dependencies: {};
        };
      };
    }>();
  });

  it('should enable to track injectCounterExtended dependencies', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const partialCounter = yield* CounterToYield({
          initialValue: signal(10),
        });

        return partialCounter;
      },
    );

    type CounterDependencies = GetInjectedServiceDependencies<
      typeof injectCounterExtended
    >;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'toProvide';
      browserBoundary: false;
      appStart: false;
      dependencies: {
        Counter: {
          scope: 'toProvide';
          browserBoundary: false;
          appStart: false;
          dependencies: {};
        };
      };
    }>();
  });

  it('should enable to track dependencies of a ServiceToYield', () => {
    const { ManuallyProvidedAtRoot1ToYield } = craftService(
      { name: 'ManuallyProvidedAtRoot1', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    type ManuallyProvidedAtRoot1ToYieldDependencies =
      GetToYieldServiceDependencies<typeof ManuallyProvidedAtRoot1ToYield>;

    expectTypeOf<ManuallyProvidedAtRoot1ToYieldDependencies>().toEqualTypeOf<{
      scope: 'manuallyProvidedAtRoot';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
    }>();
  });

  it('should enable to track child dependencies of injectCounterExtended', () => {
    const { ManuallyProvidedAtRoot1ToYield } = craftService(
      { name: 'ManuallyProvidedAtRoot1', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { ManuallyProvidedAtRoot2ToYield } = craftService(
      { name: 'ManuallyProvidedAtRoot2', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(100, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const manuallyProvidedAtRoot1 = yield* ManuallyProvidedAtRoot1ToYield();
        const manuallyProvidedAtRoot2 = yield* ManuallyProvidedAtRoot2ToYield();
        const partialCounter = yield* CounterToYield({
          initialValue: signal(10),
        });

        return {
          partialCounter,
          manuallyProvidedAtRoot1,
          manuallyProvidedAtRoot2,
        };
      },
    );

    type CounterExtendedDependencies = GetInjectedServiceDependencies<
      typeof injectCounterExtended
    >;

    expectTypeOf<CounterExtendedDependencies>().toEqualTypeOf<{
      scope: 'toProvide';
      browserBoundary: false;
      appStart: false;
      dependencies: {
        ManuallyProvidedAtRoot1: {
          scope: 'manuallyProvidedAtRoot';
          browserBoundary: false;
          appStart: false;
          dependencies: {};
        };
        ManuallyProvidedAtRoot2: {
          scope: 'manuallyProvidedAtRoot';
          browserBoundary: false;
          appStart: false;
          dependencies: {};
        };
        Counter: {
          scope: 'toProvide';
          browserBoundary: false;
          appStart: false;
          dependencies: {};
        };
      };
    }>();
  });
});

describe('typing can track all derived dependencies (only the properties that are derived/used) for direct and child dependencies', () => {
  // todo simuler un composant/directive pour le inject?
  it('should enable to track injectCounter global scope', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    type CounterDependencies = GetInjectedServiceDependencies<
      typeof injectCounter
    >;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
    }>();
  });

  it('should enable to track derived properties from CounterToYield dependency (without internal reactions)', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const partialCounter = yield* CounterToYield(
          {
            initialValue: signal(10),
          },
          ({ $self, increment }) => ({
            $self,
            incrementCounter: increment,
          }),
        );

        return partialCounter;
      },
    );

    type CounterDependencies = GetInjectedServiceDependencies<
      typeof injectCounterExtended
    >;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'toProvide';
      browserBoundary: false;
      appStart: false;
      dependencies: {
        Counter: {
          scope: 'toProvide';
          browserBoundary: false;
          appStart: false;
          dependencies: {};
          derivedPropertiesUsed: {
            $self: GetServiceOutput<typeof CounterToYield>;
            increment: GetServiceOutput<typeof CounterToYield>['increment'];
          };
          derivedPropertiesExposed: {
            $self: GetServiceOutput<typeof CounterToYield>;
            incrementCounter: GetServiceOutput<
              typeof CounterToYield
            >['increment'];
          };
        };
      };
    }>();
  });

  it('should enable to track derived properties from CounterToYield dependency (with internal reactions)', () => {
    const triggerDecrementObservable = new Subject<void>();
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const partialCounter = yield* CounterToYield(
          {
            initialValue: signal(10),
          },
          function* ({ $self, increment, decrement }) {
            const stateRef = yield* $self();
            const triggerDecrementRef = yield* decrement();

            triggerDecrementObservable.subscribe(() => {
              stateRef();
              triggerDecrementRef();
            });

            return {
              $self,
              incrementCounter: increment,
            };
          },
        );

        return partialCounter;
      },
    );

    type CounterDependencies = GetInjectedServiceDependencies<
      typeof injectCounterExtended
    >;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'toProvide';
      browserBoundary: false;
      appStart: false;
      dependencies: {
        Counter: {
          scope: 'toProvide';
          browserBoundary: false;
          appStart: false;
          dependencies: {};
          derivedPropertiesUsed: {
            $self: GetServiceOutput<typeof CounterToYield>;
            increment: GetServiceOutput<typeof CounterToYield>['increment'];
            decrement: GetServiceOutput<typeof CounterToYield>['decrement'];
          };
          derivedPropertiesExposed: {
            $self: GetServiceOutput<typeof CounterToYield>;
            incrementCounter: GetServiceOutput<
              typeof CounterToYield
            >['increment'];
          };
        };
      };
    }>();
  });
});

describe('craftService — providers', () => {
  it('providers are applied to the service factory generator', () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('service-factory');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    const { injectTrackedService } = craftService(
      {
        name: 'TrackedService',
        scope: 'global',
        providers: [provideFnWrapper(trackingWrapper)],
      },
      function* () {
        return { value: () => 1 };
      },
    );

    TestBed.runInInjectionContext(() => {
      injectTrackedService();
      expect(callLog).toEqual(['service-factory']);
    });
  });

  it('providers scoped to one craftService do not affect a sibling service', () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('called');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    const { injectSiblingA } = craftService(
      {
        name: 'SiblingA',
        scope: 'global',
        providers: [provideFnWrapper(trackingWrapper)],
      },
      function* () {
        return { value: () => 1 };
      },
    );
    const { injectSiblingB } = craftService(
      { name: 'SiblingB', scope: 'global' },
      function* () {
        return { value: () => 2 };
      },
    );

    TestBed.runInInjectionContext(() => {
      injectSiblingB();
      expect(callLog).toEqual([]);

      injectSiblingA();
      expect(callLog).toEqual(['called']);
    });
  });
});

describe.todo('contract à implémenter pour les services');

// todo later
describe.todo('compose/inject'); // todo tester si un composant override un provider si c'est bien résolu...

// todo later a "compose" helper that merge several services ?

// todo later
describe.todo(
  'testing exposing a public with symbol to know the deps and what to mock',
);

// todo later
describe.todo('enable inject options'); // handle optional params to expose....

// todo later queryparams, penser à des Symbol qui force à faire des merges, et pas à spread pour qu'on puisse les garder et les concaténer ?

// todo later injectService.explicit + eslint pour connaître toutes les deps d'une injection déclarative ?
// readonly counter = injectCounter.explicit({initialValueRef: this.initialValue}, ({initialValueRef}) => ({ inputs:  {initialValue: initialValueRef}}})); // with a type that force to handle all the deps, and if a new dep is added in the craftService, it will throw an error until it's handled in the explicit call

// todo later with option like skipHost/optional
