import {
  inject,
  InjectionToken,
  signal,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { state } from './state';
import { Subject } from 'rxjs';
import { Console, ConsoleService } from './browser-boundaries';
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
  GetServiceDependencies,
  GetServiceReferenceMeta,
  GetServiceOutput,
  GetServiceYields,
  GetServiceTrackingMetadata,
  MaybeSignal,
} from './craft-service';
import { provideFnWrapper, type FnWrapper } from './fn-wrapper';
import type { ExtractDeps } from './branded-component/branded-component';
import { query } from './query';
import { CraftHttpClient } from './craft-http-client';
import { craftUse } from './craft-use';
import { craftYieldRecord } from './craft-primitive-gen';
import { craftGen } from './craft-gen';

// todo later ne pas passer d'input et passer une dérivation inject...

describe('craftService', () => {
  it('should enable to create a craftService-like using craftService and inject it.', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });

  it('should delegate craftGen methods exposed through a service shortcut', () => {
    const { CraftGenUserApi: UserApi } = craftService(
      { name: 'CraftGenUserApi', scope: 'global' },
      function* () {
        return {
          getUser: craftGen(function* (id: string) {
            return { id };
          }),
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const user = craftUse(function* () {
        return yield* UserApi.getUser('user-42');
      });

      expect(user).toEqual({ id: 'user-42' });
    });
  });

  it('should accept a direct primitive factory and resolve primitive records', () => {
    const { DirectUserQuery } = craftService(
      { name: 'DirectUserQuery', scope: 'global' },
      (inputs: { userId: () => string }) =>
        query('userQuery', {
          params: inputs.userId,
          loader: async ({ params }) => ({ id: params }),
        }),
    );

    const { UserQueryWithState } = craftService(
      { name: 'UserQueryWithState', scope: 'global' },
      () =>
        craftYieldRecord({
          userQuery: query('userQueryWithState', {
            params: () => 'user-1',
            loader: async ({ params }) => ({ id: params }),
          }),
          refresh: state('refresh', 0, ({ update }) => ({
            increment: () => update((value) => value + 1),
          })),
        }),
    );

    TestBed.runInInjectionContext(() => {
      const directQuery = craftUse(DirectUserQuery({ userId: () => 'user-1' }));
      expect(craftUse(directQuery.status())).toBe('loading');

      const resolved = craftUse(UserQueryWithState());
      expect(craftUse(resolved.userQuery.status())).toBe('loading');
      expect(craftUse(resolved.refresh())).toBe(0);
      resolved.refresh.increment();
      expect(craftUse(resolved.refresh())).toBe(1);
    });
  });

  it('should expose browserBoundary in runtime metadata and preserve literal typing', () => {
    const { BrowserCounter, BROWSER_COUNTER_META_DATA } = craftService(
      {
        name: 'BrowserCounter',
        scope: 'global',
        browserBoundary: true,
      },
      function* () {
        const browserCounter = yield* state('browserCounter', 0);
        return browserCounter;
      },
    );

    const { DefaultCounter, DEFAULT_COUNTER_META_DATA } = craftService(
      { name: 'DefaultCounter', scope: 'global' },
      function* () {
        const defaultCounter = yield* state('defaultCounter', 0);
        return defaultCounter;
      },
    );

    expect(BROWSER_COUNTER_META_DATA.browserBoundary).toBe(true);
    expect(DEFAULT_COUNTER_META_DATA.browserBoundary).toBe(false);
    expect(getServiceMetaData(BrowserCounter).browserBoundary).toBe(true);
    expect(getServiceMetaData(DefaultCounter).browserBoundary).toBe(false);

    expectTypeOf(
      BROWSER_COUNTER_META_DATA.browserBoundary,
    ).toEqualTypeOf<true>();
    expectTypeOf(
      DEFAULT_COUNTER_META_DATA.browserBoundary,
    ).toEqualTypeOf<false>();
    expectTypeOf<
      GetServiceReferenceMeta<typeof BrowserCounter>['browserBoundary']
    >().toEqualTypeOf<true>();
    expectTypeOf<
      GetServiceTrackingMetadata<typeof BrowserCounter>['browserBoundary']
    >().toEqualTypeOf<true>();
  });

  it('should expose appStart in runtime metadata and preserve literal typing', async () => {
    let resolveAppStart!: () => void;
    const waitXTime = new Promise<void>((resolve) => {
      resolveAppStart = resolve;
    });
    const calls: string[] = [];

    const { AppStartCounter, APP_START_COUNTER_META_DATA } = craftService(
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

        return yield* state('appStartCounter', 0);
      },
    );

    expect(APP_START_COUNTER_META_DATA.appStart).toBe(true);
    expect(getServiceMetaData(AppStartCounter).appStart).toBe(true);
    expectTypeOf(APP_START_COUNTER_META_DATA.appStart).toEqualTypeOf<true>();
    expectTypeOf<
      GetServiceReferenceMeta<typeof AppStartCounter>['appStart']
    >().toEqualTypeOf<true>();
    expectTypeOf<
      GetServiceTrackingMetadata<typeof AppStartCounter>['appStart']
    >().toEqualTypeOf<true>();
    expectTypeOf<
      GetServiceDependencies<typeof AppStartCounter>['appStart']
    >().toEqualTypeOf<true>();

    await TestBed.runInInjectionContext(async () => {
      const service = craftUse(AppStartCounter());
      const pendingStart = runServiceAppStart(AppStartCounter, service);

      expect(calls).toEqual(['started']);
      expect(runServiceAppStart(AppStartCounter, service)).toBeUndefined();

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

    const { AppStartLog } = craftService(
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
      const service = craftUse(AppStartLog());
      const pendingStart = runServiceAppStart(AppStartLog, service);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'This is a log from the appStart callback',
        expect.objectContaining({
          from: ['service:AppStartLog'],
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
        const userQuery = yield* query('userQuery', {
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
      type ConsoleAppStartYield = GetServiceYields<typeof ConsoleService>;

      const { TypedAppStartLog } = craftService(
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
            const consoleService = yield* ConsoleService();

            consoleService.log('typed app start log');

            return undefined;
          });

          return 1;
        },
      );

      type AppStartLogDependencies = GetServiceDependencies<
        typeof TypedAppStartLog
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
    const { InvalidAppStart } = craftService(
      { name: 'InvalidAppStart', scope: 'global' },
      function* () {
        yield* onAppStart(() => undefined);
        return 1;
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(() => craftUse(InvalidAppStart())).toThrow(
        'craftService("InvalidAppStart") used onAppStart(...) without enabling appStart: true.',
      );
    });
  });

  it('should enable to yield another craftService', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* Counter();

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(CounterExtended());
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
      counter.incrementTwice();
      expect(craftUse(counter())).toBe(3);
    });
  });

  // todo later eslint rule to block inject inside craftService
});
describe('scope', () => {
  it('should enable to create a global craftService by passing a name/scope', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });

  it('should not expose provideCounter for craftService with global scope', () => {
    //@ts-expect-error provideCounter should not be defined for global craftService because it is provided automatically, it should not be possible to provide it manually
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    expect(provideCounter).toBeUndefined();
  });

  // todo global craftService should not expose provideService

  it('should enable to create a global craftService by passing a name/scope', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });

  it('should enable to create a toProvide craftService by passing a name/scope', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    TestBed.configureTestingModule({
      providers: [provideCounter()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });

  it('should expose provider config through $provided for a toProvide craftService while keeping public bindings separate', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: {
        $provided: { initialValue: number };
        step: number;
      }) {
        const counter = yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + inputs.step),
            readStep: () => inputs.step,
            readProvidedInitialValue: () => inputs.$provided.initialValue,
          }),
        );
        return counter;
      },
    );

    TestBed.configureTestingModule({
      providers: [provideCounter({ initialValue: 10 })],
    });

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter({ step: 2 }));

      expect(craftUse(counter())).toBe(10);
      expect(craftUse(counter.readStep())).toBe(2);
      expect(craftUse(counter.readProvidedInitialValue())).toBe(10);

      counter.increment();
      expect(craftUse(counter())).toBe(12);
    });
  });

  it('should enable to create a manuallyProvidedAtRoot craftService by passing a name/scope', () => {
    // for services that need to be provided at root but with some specific configuration (like inputs) that make it impossible to provide them with the provideService helper (or for external services like HttpClient)
    // the aim of this scope is to enable to inject it in global services while still exposing a public token for manual root providers
    const { Counter, provideCounter, CounterToProvide } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    expect(CounterToProvide).toBeInstanceOf(InjectionToken);

    TestBed.configureTestingModule({
      providers: [provideCounter()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });

  it('should expose provider config through $provided for a manuallyProvidedAtRoot craftService', () => {
    const { Counter, provideCounter, CounterToProvide } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      function* (inputs: { $provided: { initialValue: number } }) {
        const counter = yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + 1),
            readProvidedInitialValue: () => inputs.$provided.initialValue,
          }),
        );
        return counter;
      },
    );

    TestBed.configureTestingModule({
      providers: [provideCounter({ initialValue: 7 })],
    });

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());
      const providedCounter = inject(CounterToProvide);

      expect(counter).toBe(providedCounter);
      expect(craftUse(counter())).toBe(7);
      expect(craftUse(counter.readProvidedInitialValue())).toBe(7);
    });
  });

  it('should enable to manually provide a manuallyProvidedAtRoot craftService through CounterToProvide', () => {
    const { Counter, CounterToProvide } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: CounterToProvide,
          useFactory: () =>
            craftUse(
              state('manualCounter', 10, ({ update }) => ({
                increment: () => update((v) => v + 1),
              })),
            ),
        },
      ],
    });

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());
      expect(craftUse(counter())).toBe(10);
      counter.increment();
      expect(craftUse(counter())).toBe(11);
    });
  });

  it('should enable to create a function craftService by passing a name/scope (mostly used for reusability and composition/inputs...)', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'function' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });

  it('should only allow $provided on provider-capable scopes', () => {
    if (false) {
      craftService(
        { name: 'Counter', scope: 'global' },
        //@ts-expect-error $provided should stay reserved to toProvide/manuallyProvidedAtRoot craftService scopes
        function* (inputs: { $provided: { initialValue: number } }) {
          const counter = yield* state(
            'counter',
            inputs.$provided.initialValue,
          );
          return counter;
        },
      );
    }

    if (false) {
      craftService(
        { name: 'Counter', scope: 'function' },
        //@ts-expect-error $provided should stay reserved to toProvide/manuallyProvidedAtRoot craftService scopes
        function* (inputs: { $provided: { initialValue: number } }) {
          const counter = yield* state(
            'counter',
            inputs.$provided.initialValue,
          );
          return counter;
        },
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
    const { Counter } = counterService;

    expectTypeOf(Counter).toMatchTypeOf<() => Generator>();
    expect(Counter).toBeDefined();

    // An abstract craftService exposes provideCounter so its contract can be
    // implemented inline from a (possibly generator) factory.
    const { provideCounter } = counterService;
    expect(provideCounter).toBeDefined();
  });

  it('should let an abstract craftService provide its contract inline via provideX', () => {
    interface Counter {
      value: number;
    }
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'abstract' },
      abstract<Counter>(),
    );

    TestBed.configureTestingModule({
      providers: [provideCounter(() => ({ value: 42 }))],
    });

    TestBed.runInInjectionContext(() => {
      expect(craftUse(Counter())).toEqual({ value: 42 });
    });
  });

  it('should resolve services yielded inside an abstract provideX generator factory', () => {
    const { Seed } = craftService({ name: 'Seed', scope: 'global' }, () => ({
      base: 10,
    }));
    const { Score, provideScore } = craftService(
      { name: 'Score', scope: 'abstract' },
      abstract<{ total: number }>(),
    );

    TestBed.configureTestingModule({
      providers: [
        provideScore(function* () {
          const seed = yield* Seed();
          return { total: seed.base + 5 };
        }),
      ],
    });

    TestBed.runInInjectionContext(() => {
      expect(craftUse(Score())).toEqual({ total: 15 });
    });
  });

  it('should expose X on an abstract craftService so its contract can be composed into another craftService', () => {
    const { provideUser, User } = craftService(
      { name: 'User', scope: 'abstract' },
      abstract<{ name: string }>(),
    );

    const { Greeting, provideGreeting } = craftService(
      { name: 'Greeting', scope: 'toProvide' },
      function* () {
        const user = yield* User();
        return { hello: `Hi ${user.name}` };
      },
    );

    TestBed.configureTestingModule({
      providers: [provideUser(() => ({ name: 'Ada' })), provideGreeting()],
    });

    TestBed.runInInjectionContext(() => {
      expect(craftUse(Greeting())).toEqual({ hello: 'Hi Ada' });
    });
  });

  it('should enable to create a craftService from an abstract craftService through requirement (It should provide the implementation craftService and abstract craftService)', () => {
    const { Counter, CounterRequirement } = craftService(
      { name: 'Counter', scope: 'abstract' },
      abstract<{
        (): number;
        increment(): void;
      }>(),
    );

    // todo CounterRequirement should only be exposed when scope: 'abstract' is set

    // todo when creating from requirement: CounterRequirement it should not be possible to create a global (to force to provide it ?) non
    const { CounterImpl, provideCounterImpl } = craftService(
      {
        name: 'CounterImpl',
        scope: 'toProvide',
        requirement: CounterRequirement,
      },
      function* () {
        const counterImpl = yield* state('counterImpl', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counterImpl;
      },
    );

    // todo provideCounterImpl should provide CounterImpl and the source of CounterRequirement

    TestBed.configureTestingModule({
      providers: [provideCounterImpl()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);

      const counterImpl = craftUse(CounterImpl());
      expect(craftUse(counterImpl())).toBe(1);
    });
  });

  it('should enable to create a craftService from craftRequirement inline', () => {
    interface Counter {
      (): number;
      increment(): void;
    }

    const { CounterImpl, provideCounterImpl } = craftService(
      {
        name: 'CounterImpl',
        scope: 'toProvide',
        requirement: craftRequirement<Counter>(),
      },
      function* () {
        const counterImpl = yield* state('counterImpl', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counterImpl;
      },
    );

    TestBed.configureTestingModule({
      providers: [provideCounterImpl()],
    });

    TestBed.runInInjectionContext(() => {
      const counterImpl = craftUse(CounterImpl());
      expect(craftUse(counterImpl())).toBe(0);
      counterImpl.increment();
      expect(craftUse(counterImpl())).toBe(1);
    });
  });

  it('should allow an inline craftRequirement with a named interface contract', () => {
    interface Counter {
      increment(): void;
    }

    const increment = vi.fn();
    const { CounterImpl, provideCounterImpl } = craftService(
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
      const counterImpl = craftUse(CounterImpl());
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
    const { CounterImpl, provideCounterImpl } = craftService(
      {
        name: 'CounterImpl',
        scope: 'toProvide',
        requirement: CounterRequirement,
      },
      function* () {
        const counterImpl = yield* state('counterImpl', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counterImpl;
      },
    );

    expect(CounterRequirement.token).toBeInstanceOf(InjectionToken);

    TestBed.configureTestingModule({
      providers: [provideCounterImpl()],
    });

    TestBed.runInInjectionContext(() => {
      const counterImpl = craftUse(CounterImpl());
      const counter = inject(CounterRequirement.token);

      expect(counter).toBe(counterImpl);
      counter.increment();
      expect(craftUse(counterImpl())).toBe(1);
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
      function* () {
        const counterImpl = yield* state('counterImpl', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counterImpl;
      },
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
      function* () {
        const counterImpl = yield* state('counterImpl', 0);
        return counterImpl;
      },
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
        function* () {
          const counterImpl = yield* state('counterImpl', 0);
          return counterImpl;
        },
      );
    }
  });

  it('should not enable to create a global craftService that depends on a toProvide craftService', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    //@ts-expect-error it should not be possible to create a global craftService that depends on a toProvide craftService because the dependency cannot be resolved, it should force to provide the craftService in the test or use manuallyProvidedAtRoot for the craftService that need to be yield in a global craftService
    craftService({ name: 'GlobalCounter', scope: 'global' }, function* () {
      const counter = yield* Counter();
      return counter;
    });
  });

  it('should enable to create a global craftService that depends on a manuallyProvidedAtRoot craftService', () => {
    const { provideCounter, Counter } = craftService(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      function* () {
        const counter = yield* state('counter', 0, ({ update }) => ({
          increment: () => update((v) => v + 1),
        }));
        return counter;
      },
    );

    const { GlobalCounter } = craftService(
      { name: 'GlobalCounter', scope: 'global' },
      function* () {
        const counter = yield* Counter();
        return counter;
      },
    );

    TestBed.configureTestingModule({
      providers: [provideCounter()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(GlobalCounter());
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });
});

describe('injectService should enable to binding inputs', () => {
  it('should keep $provided private from inject helpers and preserve the provider value at runtime', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: {
        $provided: { initialValue: number };
        step: number;
      }) {
        const counter = yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + inputs.step),
          }),
        );
        return counter;
      },
    );

    TestBed.configureTestingModule({
      providers: [provideCounter({ initialValue: 10 })],
    });

    if (false) {
      craftUse(
        // @ts-expect-error $provided should not be a public inject binding
        Counter({
          step: 2,
          $provided: { initialValue: 99 },
        }),
      );
    }

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(
        Reflect.apply(Counter, undefined, [
          {
            step: 2,
            $provided: { initialValue: 99 },
          },
        ]) as ReturnType<typeof Counter>,
      ) as { (): number; increment(): void };

      expect(craftUse(counter())).toBe(10);
      counter.increment();
      expect(craftUse(counter())).toBe(12);
    });
  });

  it('should enable to bind a signal input', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = craftUse(Counter({ initialValue: 0 }));
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });

  it('should enable to bind an optional signal input and not bind an optional input', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      function* (inputs: {
        initialValue: MaybeSignal<number>;
        optionalProperty1?: MaybeSignal<number>;
        optionalProperty2?: MaybeSignal<number>;
      }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(
        Counter({ initialValue: 0, optionalProperty1: 0 }),
      );
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });

  it('should enable to bind a signal input', () => {
    // todoBefore mettre inputs/method ? pour simpliéfier le binding ? et permet de rajouter un provide plus tard
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const initialValue = signal(0);
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = craftUse(Counter({ initialValue }));
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });
  });

  it('should return a string as an error "Inputs Error, xxx is not provided" if an input is not provided', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(() => craftUse(Counter())).toThrow(
        'Inputs Error, initialValue is not provided',
      );
    });
  });
  it('should provide a string token to say that the input is already provided', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const initialValue = signal(0);
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = craftUse(Counter({ initialValue }));
      expect(craftUse(counter())).toBe(0);
      counter.increment();
      expect(craftUse(counter())).toBe(1);
    });

    TestBed.runInInjectionContext(() => {
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = craftUse(
        Counter({
          initialValue: 'Provided elsewhere #warn-check-docs:inputs',
        }),
      );
      expect(craftUse(counter())).toBe(1);
      counter.increment();
      expect(craftUse(counter())).toBe(2);
    });
  });
});

// todoBefore generatrice aussi
describe('service should enable to binding inputs', () => {
  it('should keep $provided private from yield helpers', () => {
    const { Counter, provideCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: {
        $provided: { initialValue: number };
        step: number;
      }) {
        const counter = yield* state(
          'counter',
          inputs.$provided.initialValue,
          ({ update }) => ({
            increment: () => update((value) => value + inputs.step),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended, provideCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* Counter({ step: 2 });

        return {
          read: () => craftUse(counter()),
          increment: () => counter.increment(),
        };
      },
    );

    // eslint-disable-next-line no-constant-condition
    if (false) {
      craftUse(
        // @ts-expect-error $provided should not be a public Counter binding
        Counter({
          step: 2,
          $provided: { initialValue: 99 },
        }),
      );
    }

    TestBed.configureTestingModule({
      providers: [
        provideCounter({ initialValue: 10 }),
        provideCounterExtended(),
      ],
    });

    TestBed.runInInjectionContext(() => {
      const counterExtended = craftUse(CounterExtended());

      expect(counterExtended.read()).toBe(10);
      counterExtended.increment();
      expect(counterExtended.read()).toBe(12);
    });
  });

  it('should enable to bind a raw input', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* Counter({ initialValue: 10 });

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(CounterExtended());
      expect(craftUse(counter())).toBe(10);
      counter.increment();
      expect(craftUse(counter())).toBe(11);
      counter.incrementTwice();
      expect(craftUse(counter())).toBe(13);
    });
  });

  it('should enable to bind a signal input', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* Counter({ initialValue: signal(10) });

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(CounterExtended());
      expect(craftUse(counter())).toBe(10);
      counter.increment();
      expect(craftUse(counter())).toBe(11);
      counter.incrementTwice();
      expect(craftUse(counter())).toBe(13);
    });
  });

  it('should enable to bind an optional input and not bind an optional input', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* (inputs: {
        initialValue: MaybeSignal<number>;
        optionalProperty1?: MaybeSignal<number>;
        optionalProperty2?: MaybeSignal<number>;
      }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* Counter({
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
      const counter = craftUse(CounterExtended());
      expect(craftUse(counter())).toBe(10);
      counter.increment();
      expect(craftUse(counter())).toBe(11);
      counter.incrementTwice();
      expect(craftUse(counter())).toBe(13);
    });
  });

  it('should return a string as an error "Inputs Error, xxx is not provided" if an input is not provided or blocks the yield', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* Counter();
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(() => craftUse(CounterExtended())).toThrow(
        'Inputs Error, initialValue is not provided',
      );
    });
  });
  it('should provide a string token to say that the input is already provided', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter1 = yield* Counter({ initialValue: signal(10) });
        // todobefore it is possible to yield the same craftService twice ?
        const counter2 = yield* Counter({
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
      const counter = craftUse(CounterExtended());
      expect(craftUse(counter())).toBe(10);
      counter.increment();
      expect(craftUse(counter())).toBe(11);
      counter.incrementTwice();
      expect(craftUse(counter())).toBe(13);
    });
  });

  it('should enable to yield a craftService with the scope function several times that will generate different instances', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'function' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter1 = yield* Counter({
          initialValue: signal(10),
        });
        const counter2 = yield* Counter({
          initialValue: signal(20),
        });

        return {
          counter1,
          counter2,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = craftUse(CounterExtended());
      expect(craftUse(counterHandler.counter1())).toBe(10);
      counterHandler.counter1.increment();
      expect(craftUse(counterHandler.counter1())).toBe(11);
      expect(craftUse(counterHandler.counter2())).toBe(20);
      counterHandler.counter2.increment();
      expect(craftUse(counterHandler.counter2())).toBe(21);
    });
  });
});

describe('injectService/Service should expose an optional parameter that can be used to only expose what is needed and yield* dep must be used to declare non exposed fields. “Any dependency that is used but not exposed must be yielded (with yield*) in order to be counted.”', () => {
  it('should enable to explicitly re-expose the root callable when using Counter', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 10, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        }));
        return counter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = craftUse(
        Counter({}, ({ $self, increment }) => ({
          $self,
          increment,
        })),
      );

      //@ts-expect-error decrement should not be accessible because it is not exposed
      expect(counterHandler.decrement).toBeUndefined();

      //@ts-expect-error $self should not be accessible because it is merged back at the root
      expect(counterHandler.$self).toBeUndefined();

      expect('decrement' in counterHandler).toBe(false);
      expect('$self' in counterHandler).toBe(false);
      expect(craftUse(counterHandler())).toBe(10);
      counterHandler.increment();
      expect(craftUse(counterHandler())).toBe(11);
    });
  });

  it('should enable to track hidden dependencies when using Counter', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      () => {
        const counter = craftUse(
          state('counter', 10, ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          })),
        );

        return {
          state: counter,
          increment: counter.increment,
          decrement: counter.decrement,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const triggerDecrementObservable = new Subject<void>();
      const counterHandler = craftUse(
        Counter({}, function* ({ state, increment, decrement }) {
          const decrementRef = yield* decrement();
          triggerDecrementObservable.subscribe(() => decrementRef());

          return {
            state,
            increment,
          };
        }),
      );

      //@ts-expect-error decrement should not be accessible because it is not exposed
      expect(counterHandler.decrement).toBeUndefined();

      expect('decrement' in counterHandler).toBe(false);
      expect(craftUse(counterHandler.state())).toBe(10);
      counterHandler.increment();
      expect(craftUse(counterHandler.state())).toBe(11);
      triggerDecrementObservable.next();
      expect(craftUse(counterHandler.state())).toBe(10);
    });
  });

  it('should enable to track hidden dependencies from Service', () => {
    const triggerDecrementObservable = new Subject<void>();

    const { Counter } = craftService(
      { name: 'Counter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) => {
        const counter = craftUse(
          state('counter', toValue(inputs.initialValue), ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          })),
        );

        return {
          state: counter,
          increment: counter.increment,
          decrement: counter.decrement,
        };
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* Counter(
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
      const counterHandler = craftUse(CounterExtended());

      //@ts-expect-error decrement should not be accessible because it is not exposed
      expect(counterHandler.decrement).toBeUndefined();

      expect('decrement' in counterHandler).toBe(false);
      expect(craftUse(counterHandler.state())).toBe(10);
      counterHandler.increment();
      expect(craftUse(counterHandler.state())).toBe(11);
      triggerDecrementObservable.next();
      expect(craftUse(counterHandler.state())).toBe(10);
    });
  });

  it('should enable  single-property shortcuts to return a derived property', async () => {
    type User = {
      id: string;
      name: string;
    };

    const users = signal<User[]>([{ id: '1', name: 'Romain' }]);

    const { SinglePropertyShortcutApi } = craftService(
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

    const { SinglePropertyShortcutConsumer } = craftService(
      { name: 'SinglePropertyShortcutConsumer', scope: 'global' },
      function* () {
        const updateItem = yield* SinglePropertyShortcutApi.updateItem();

        expectTypeOf(updateItem).toEqualTypeOf<
          GetServiceOutput<typeof SinglePropertyShortcutApi>['updateItem']
        >();

        return {
          updateItem,
        };
      },
    );

    expect(getServiceMetaData(SinglePropertyShortcutApi.updateItem).name).toBe(
      'SinglePropertyShortcutApi',
    );

    type ConsumerDependencies = GetServiceDependencies<
      typeof SinglePropertyShortcutConsumer
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
              typeof SinglePropertyShortcutApi
            >['updateItem'];
          };
          derivedPropertiesExposed: {
            updateItem: GetServiceOutput<
              typeof SinglePropertyShortcutApi
            >['updateItem'];
          };
        };
      };
    }>();

    await TestBed.runInInjectionContext(async () => {
      const consumer = craftUse(SinglePropertyShortcutConsumer());

      await expect(
        consumer.updateItem({ id: '1', name: 'Geffrault' }),
      ).resolves.toEqual({ id: '1', name: 'Geffrault' });
      expect(users()).toEqual([{ id: '1', name: 'Geffrault' }]);
    });
  });

  it('should enable  method shortcuts to call a derived method directly when the service has no public inputs', async () => {
    type User = {
      id: string;
      name: string;
    };

    const users = signal<User[]>([{ id: '1', name: 'Romain' }]);

    const { DirectMethodShortcutApi } = craftService(
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

    const { DirectMethodShortcutConsumer } = craftService(
      { name: 'DirectMethodShortcutConsumer', scope: 'global' },
      function* () {
        const result = yield* DirectMethodShortcutApi.updateItem({
          id: '1',
          name: 'Geffrault',
        });

        expectTypeOf(result).toEqualTypeOf<
          ReturnType<
            GetServiceOutput<typeof DirectMethodShortcutApi>['updateItem']
          >
        >();

        return result;
      },
    );

    type ConsumerDependencies = GetServiceDependencies<
      typeof DirectMethodShortcutConsumer
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
              typeof DirectMethodShortcutApi
            >['updateItem'];
          };
          derivedPropertiesExposed: {
            updateItem: GetServiceOutput<
              typeof DirectMethodShortcutApi
            >['updateItem'];
          };
        };
      };
    }>();

    await TestBed.runInInjectionContext(async () => {
      await expect(craftUse(DirectMethodShortcutConsumer())).resolves.toEqual({
        id: '1',
        name: 'Geffrault',
      });
      expect(users()).toEqual([{ id: '1', name: 'Geffrault' }]);
    });
  });

  it('should pass bindings to  single-property shortcuts', () => {
    const calls: number[] = [];

    const { InputShortcutCounter } = craftService(
      { name: 'InputShortcutCounter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) => ({
        increment: () => calls.push(toValue(inputs.initialValue) + 1),
      }),
    );

    const { InputShortcutCounterConsumer } = craftService(
      { name: 'InputShortcutCounterConsumer', scope: 'global' },
      function* () {
        const increment = yield* InputShortcutCounter.increment({
          initialValue: signal(10),
        });

        expectTypeOf(increment).toEqualTypeOf<
          GetServiceOutput<typeof InputShortcutCounter>['increment']
        >();

        return {
          increment,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const consumer = craftUse(InputShortcutCounterConsumer());

      consumer.increment();

      expect(calls).toEqual([11]);
    });
  });

  it('should enable inject single-property shortcuts to return a derived property', async () => {
    type User = {
      id: string;
      name: string;
    };

    const users = signal<User[]>([{ id: '1', name: 'Romain' }]);

    const { SinglePropertyShortcutInjectApi } = craftService(
      { name: 'SinglePropertyShortcutInjectApi', scope: 'global' },
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

    expect(
      getServiceMetaData(SinglePropertyShortcutInjectApi.updateItem).name,
    ).toBe('SinglePropertyShortcutInjectApi');

    type ShortcutDependencies = GetServiceDependencies<
      typeof SinglePropertyShortcutInjectApi.updateItem
    >;

    expectTypeOf<ShortcutDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
      derivedPropertiesUsed: {
        updateItem: GetServiceOutput<
          typeof SinglePropertyShortcutInjectApi
        >['updateItem'];
      };
      derivedPropertiesExposed: {
        updateItem: GetServiceOutput<
          typeof SinglePropertyShortcutInjectApi
        >['updateItem'];
      };
    }>();

    await TestBed.runInInjectionContext(async () => {
      const updateItem = craftUse(SinglePropertyShortcutInjectApi.updateItem());

      expectTypeOf(updateItem).toEqualTypeOf<
        GetServiceOutput<typeof SinglePropertyShortcutInjectApi>['updateItem']
      >();

      await expect(updateItem({ id: '1', name: 'Geffrault' })).resolves.toEqual(
        { id: '1', name: 'Geffrault' },
      );
      expect(users()).toEqual([{ id: '1', name: 'Geffrault' }]);
    });
  });

  it('should enable inject method shortcuts to call a derived method directly when the service has no public inputs', async () => {
    type User = {
      id: string;
      name: string;
    };

    const users = signal<User[]>([{ id: '1', name: 'Romain' }]);

    const { DirectMethodShortcutInjectApi } = craftService(
      { name: 'DirectMethodShortcutInjectApi', scope: 'global' },
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

    type ShortcutDependencies = GetServiceDependencies<
      typeof DirectMethodShortcutInjectApi.updateItem
    >;

    expectTypeOf<ShortcutDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
      derivedPropertiesUsed: {
        updateItem: GetServiceOutput<
          typeof DirectMethodShortcutInjectApi
        >['updateItem'];
      };
      derivedPropertiesExposed: {
        updateItem: GetServiceOutput<
          typeof DirectMethodShortcutInjectApi
        >['updateItem'];
      };
    }>();

    await TestBed.runInInjectionContext(async () => {
      const result = craftUse(
        DirectMethodShortcutInjectApi.updateItem({
          id: '1',
          name: 'Geffrault',
        }),
      );

      expectTypeOf(result).toEqualTypeOf<
        ReturnType<
          GetServiceOutput<typeof DirectMethodShortcutInjectApi>['updateItem']
        >
      >();

      await expect(result).resolves.toEqual({ id: '1', name: 'Geffrault' });
      expect(users()).toEqual([{ id: '1', name: 'Geffrault' }]);
    });
  });

  it('should pass bindings to inject single-property shortcuts', () => {
    const calls: number[] = [];

    const { InputShortcutCounterInject } = craftService(
      { name: 'InputShortcutCounterInject', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) => ({
        increment: () => calls.push(toValue(inputs.initialValue) + 1),
      }),
    );

    TestBed.runInInjectionContext(() => {
      const increment = craftUse(
        InputShortcutCounterInject.increment({
          initialValue: signal(10),
        }),
      );

      expectTypeOf(increment).toEqualTypeOf<
        GetServiceOutput<typeof InputShortcutCounterInject>['increment']
      >();

      increment();

      expect(calls).toEqual([11]);
    });
  });

  it('should enable inject nested-property shortcuts', () => {
    const isLoading = signal(false);

    const { NestedPropShortcutService } = craftService(
      { name: 'NestedPropShortcutService', scope: 'global' },
      () => ({
        userQuery: { isLoading, data: signal<string | null>(null) },
      }),
    );

    type ShortcutDependencies = GetServiceDependencies<
      typeof NestedPropShortcutService.userQuery.isLoading
    >;

    expectTypeOf<ShortcutDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
      derivedPropertiesUsed: {
        userQuery: { isLoading: typeof isLoading };
      };
      derivedPropertiesExposed: {
        userQuery: { isLoading: typeof isLoading };
      };
    }>();

    TestBed.runInInjectionContext(() => {
      const result = craftUse(NestedPropShortcutService.userQuery.isLoading());
      expectTypeOf(result).toMatchTypeOf<typeof isLoading>();
      expect(result).toBe(isLoading);
    });
  });

  it('should enable  nested-property shortcuts', () => {
    const isLoading = signal(false);

    const { NestedPropApi } = craftService(
      { name: 'NestedPropApi', scope: 'global' },
      () => ({
        userQuery: { isLoading, data: signal<string | null>(null) },
      }),
    );

    const { NestedPropConsumer } = craftService(
      { name: 'NestedPropConsumer', scope: 'global' },
      function* () {
        const loadingSignal = yield* NestedPropApi.userQuery.isLoading();
        expectTypeOf(loadingSignal).toEqualTypeOf<typeof isLoading>();
        return { isLoading: loadingSignal };
      },
    );

    type ConsumerDependencies = GetServiceDependencies<
      typeof NestedPropConsumer
    >;

    expectTypeOf<ConsumerDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {
        NestedPropApi: {
          scope: 'global';
          browserBoundary: false;
          appStart: false;
          dependencies: {};
          derivedPropertiesUsed: {
            userQuery: { isLoading: typeof isLoading };
          };
          derivedPropertiesExposed: {
            userQuery: { isLoading: typeof isLoading };
          };
        };
      };
    }>();

    TestBed.runInInjectionContext(() => {
      const consumer = craftUse(NestedPropConsumer());
      expect(consumer.isLoading).toBe(isLoading);
    });
  });

  it('should require OmitInputs for no-arg property shortcuts when service has public inputs', () => {
    const { OmitInputsInjectCounter } = craftService(
      { name: 'OmitInputsInjectCounter', scope: 'function' },
      (inputs: { initialValue?: MaybeSignal<number> }) => ({
        count: toValue(inputs.initialValue) ?? 0,
      }),
    );

    TestBed.runInInjectionContext(() => {
      const count = craftUse(OmitInputsInjectCounter.OmitInputs.count());
      expectTypeOf(count).toEqualTypeOf<number>();
      expect(count).toBe(0);

      const countWithBindings = craftUse(
        OmitInputsInjectCounter.count({
          initialValue: signal(5),
        }),
      );
      expectTypeOf(countWithBindings).toEqualTypeOf<number>();
      expect(countWithBindings).toBe(5);

      // @ts-expect-error: no-arg without OmitInputs is a type error
      OmitInputsInjectCounter.count();
    });
  });

  it('should require OmitInputs for no-arg property shortcuts when  service has public inputs', () => {
    const { OmitInputsYieldCounter } = craftService(
      { name: 'OmitInputsYieldCounter', scope: 'function' },
      (inputs: { initialValue?: MaybeSignal<number> }) => ({
        count: toValue(inputs.initialValue) ?? 0,
      }),
    );

    const { OmitInputsYieldConsumer } = craftService(
      { name: 'OmitInputsYieldConsumer', scope: 'global' },
      function* () {
        const count = yield* OmitInputsYieldCounter.OmitInputs.count();
        expectTypeOf(count).toEqualTypeOf<number>();
        return { count };
      },
    );

    // @ts-expect-error: no-arg without OmitInputs is a type error
    OmitInputsYieldCounter.count();

    TestBed.runInInjectionContext(() => {
      const consumer = craftUse(OmitInputsYieldConsumer());
      expect(consumer.count).toBe(0);
    });
  });

  it('should enable combined OmitInputs and nested shortcuts', () => {
    const isLoading = signal(true);

    const { OmitInputsNestedService } = craftService(
      { name: 'OmitInputsNestedService', scope: 'function' },
      (inputs: { userId?: string }) => ({
        userQuery: {
          isLoading,
          userId: inputs.userId ?? 'default',
        },
      }),
    );

    TestBed.runInInjectionContext(() => {
      const result = craftUse(
        OmitInputsNestedService.OmitInputs.userQuery.isLoading(),
      );
      expectTypeOf(result).toMatchTypeOf<typeof isLoading>();
      expect(result).toBe(isLoading);
    });
  });

  it('should not keep the root callable implicitly when using Counter without $self', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'function' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const partialCounter = yield* Counter(
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
      const counterHandler = craftUse(CounterExtended());

      expect('decrement' in counterHandler).toBe(false);
      expect('incrementCounter' in counterHandler).toBe(true);
      //@ts-expect-error counterHandler should not be callable without exposing $self
      expect(() => counterHandler()).toThrow(TypeError);
      counterHandler.incrementCounter();
      //@ts-expect-error counterHandler should not be callable without exposing $self
      expect(() => counterHandler()).toThrow(TypeError);
    });
  });

  it('should enable to explicitly re-expose the root callable when using Counter', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'function' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* Counter(
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
      const counterHandler = craftUse(CounterExtended());

      //@ts-expect-error $self should not be accessible because it is merged back at the root
      expect(counterHandler.$self).toBeUndefined();

      expect('$self' in counterHandler).toBe(false);
      expect(craftUse(counterHandler())).toBe(10);
      counterHandler.incrementCounter();
      expect(craftUse(counterHandler())).toBe(11);
    });
  });

  it('should enable to track hidden root callable dependencies from Service', () => {
    const triggerDecrementObservable = new Subject<void>();

    const { Counter } = craftService(
      { name: 'Counter', scope: 'function' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* Counter(
          {
            initialValue: signal(10),
          },
          function* ({ $self, increment, decrement }) {
            const stateRef = yield* $self();
            const decrementRef = yield* decrement();

            triggerDecrementObservable.subscribe(() => {
              craftUse(stateRef());
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
      const counterHandler = craftUse(CounterExtended());

      expect(craftUse(counterHandler())).toBe(10);
      counterHandler.incrementCounter();
      expect(craftUse(counterHandler())).toBe(11);
      triggerDecrementObservable.next();
      expect(craftUse(counterHandler())).toBe(10);
    });
  });
});

describe('typing can track all dependencies (direct and child dependencies)', () => {
  it('should enable to track Counter global scope', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    type CounterDependencies = GetServiceDependencies<typeof Counter>;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
    }>();
  });

  it('should enable to track Counter scope', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    type CounterDependencies = GetServiceDependencies<typeof Counter>;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'toProvide';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
    }>();
  });

  it('should preserve browserBoundary on a dependency node', () => {
    const { BrowserStorage } = craftService(
      {
        name: 'BrowserStorage',
        scope: 'global',
        browserBoundary: true,
      },
      () => ({
        read: () => localStorage.getItem('key'),
      }),
    );

    const { StorageConsumer } = craftService(
      { name: 'StorageConsumer', scope: 'global' },
      function* () {
        const storage = yield* BrowserStorage();

        return {
          read: () => storage.read(),
        };
      },
    );

    type StorageConsumerDependencies = GetServiceDependencies<
      typeof StorageConsumer
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

  it('should enable to track CounterExtended dependencies', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const partialCounter = yield* Counter({
          initialValue: signal(10),
        });

        return partialCounter;
      },
    );

    type CounterDependencies = GetServiceDependencies<typeof CounterExtended>;

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

  it('should enable to track dependencies of a Service', () => {
    const { ManuallyProvidedAtRoot1 } = craftService(
      { name: 'ManuallyProvidedAtRoot1', scope: 'manuallyProvidedAtRoot' },
      function* () {
        const manuallyProvidedAtRoot1 = yield* state(
          'manuallyProvidedAtRoot1',
          0,
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return manuallyProvidedAtRoot1;
      },
    );

    type ManuallyProvidedAtRoot1Dependencies = GetServiceDependencies<
      typeof ManuallyProvidedAtRoot1
    >;

    expectTypeOf<ManuallyProvidedAtRoot1Dependencies>().toEqualTypeOf<{
      scope: 'manuallyProvidedAtRoot';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
    }>();
  });

  it('should enable to track child dependencies of CounterExtended', () => {
    const { ManuallyProvidedAtRoot1 } = craftService(
      { name: 'ManuallyProvidedAtRoot1', scope: 'manuallyProvidedAtRoot' },
      function* () {
        const manuallyProvidedAtRoot1 = yield* state(
          'manuallyProvidedAtRoot1',
          0,
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return manuallyProvidedAtRoot1;
      },
    );

    const { ManuallyProvidedAtRoot2 } = craftService(
      { name: 'ManuallyProvidedAtRoot2', scope: 'manuallyProvidedAtRoot' },
      function* () {
        const manuallyProvidedAtRoot2 = yield* state(
          'manuallyProvidedAtRoot2',
          100,
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return manuallyProvidedAtRoot2;
      },
    );

    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const manuallyProvidedAtRoot1 = yield* ManuallyProvidedAtRoot1();
        const manuallyProvidedAtRoot2 = yield* ManuallyProvidedAtRoot2();
        const partialCounter = yield* Counter({
          initialValue: signal(10),
        });

        return {
          partialCounter,
          manuallyProvidedAtRoot1,
          manuallyProvidedAtRoot2,
        };
      },
    );

    type CounterExtendedDependencies = GetServiceDependencies<
      typeof CounterExtended
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
  it('should enable to track Counter global scope', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    type CounterDependencies = GetServiceDependencies<typeof Counter>;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'global';
      browserBoundary: false;
      appStart: false;
      dependencies: {};
    }>();
  });

  it('should enable to track derived properties from Counter dependency (without internal reactions)', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const partialCounter = yield* Counter(
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

    type CounterDependencies = GetServiceDependencies<typeof CounterExtended>;

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
            $self: GetServiceOutput<typeof Counter>;
            increment: GetServiceOutput<typeof Counter>['increment'];
          };
          derivedPropertiesExposed: {
            $self: GetServiceOutput<typeof Counter>;
            incrementCounter: GetServiceOutput<typeof Counter>['increment'];
          };
        };
      };
    }>();
  });

  it('should enable to track derived properties from Counter dependency (with internal reactions)', () => {
    const triggerDecrementObservable = new Subject<void>();
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      function* (inputs: { initialValue: MaybeSignal<number> }) {
        const counter = yield* state(
          'counter',
          toValue(inputs.initialValue),
          ({ update }) => ({
            increment: () => update((v) => v + 1),
            decrement: () => update((v) => v - 1),
          }),
        );
        return counter;
      },
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const partialCounter = yield* Counter(
          {
            initialValue: signal(10),
          },
          function* ({ $self, increment, decrement }) {
            const stateRef = yield* $self();
            const triggerDecrementRef = yield* decrement();

            triggerDecrementObservable.subscribe(() => {
              craftUse(stateRef());
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

    type CounterDependencies = GetServiceDependencies<typeof CounterExtended>;

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
            $self: GetServiceOutput<typeof Counter>;
            increment: GetServiceOutput<typeof Counter>['increment'];
            decrement: GetServiceOutput<typeof Counter>['decrement'];
          };
          derivedPropertiesExposed: {
            $self: GetServiceOutput<typeof Counter>;
            incrementCounter: GetServiceOutput<typeof Counter>['increment'];
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

    const { TrackedService } = craftService(
      {
        name: 'TrackedService',
        scope: 'global',
        providers: [
          provideFnWrapper(
            'Warning: dependency injection here is not type-safe and may fail at runtime',
            trackingWrapper,
          ),
        ],
      },
      function* () {
        return { value: () => 1 };
      },
    );

    TestBed.runInInjectionContext(() => {
      craftUse(TrackedService());
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

    const { SiblingA } = craftService(
      {
        name: 'SiblingA',
        scope: 'global',
        providers: [
          provideFnWrapper(
            'Warning: dependency injection here is not type-safe and may fail at runtime',
            trackingWrapper,
          ),
        ],
      },
      function* () {
        return { value: () => 1 };
      },
    );
    const { SiblingB } = craftService(
      { name: 'SiblingB', scope: 'global' },
      function* () {
        return { value: () => 2 };
      },
    );

    TestBed.runInInjectionContext(() => {
      craftUse(SiblingB());
      expect(callLog).toEqual([]);

      craftUse(SiblingA());
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
// readonly counter = Counter.explicit({initialValueRef: this.initialValue}, ({initialValueRef}) => ({ inputs:  {initialValue: initialValueRef}}})); // with a type that force to handle all the deps, and if a new dep is added in the craftService, it will throw an error until it's handled in the explicit call

// todo later with option like skipHost/optional
