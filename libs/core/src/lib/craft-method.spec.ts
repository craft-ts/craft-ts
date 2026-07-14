import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { Equal, Expect } from 'test-type';
import type { ExtractDeps } from './branded-component/branded-component';
import { Console } from './browser-boundaries';
import { craftMethod } from './craft-method';
import {
  craftService,
  type GetToYieldServiceDependencies,
  onAppStart,
} from './craft-service';
import { provideFnWrapper, type FnWrapper } from './fn-wrapper';

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

describe('craftMethod', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('should require an injection context when creating the method', () => {
    class OutsideInjectionContextComponent {
      readonly increment = craftMethod('increment', this, function* () {
        return 1;
      });
    }

    expect(() => new OutsideInjectionContextComponent()).toThrow();
  });

  it('should support Browser Boundaries from the this-capturing overload', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    class CounterComponent {
      readonly counter = signal(0);

      readonly increment = craftMethod(
        'increment',
        this,
        function* (step: number = 1) {
          yield* Console.log('increment');
          this.counter.update((value) => value + step);
          return this.counter();
        },
      );
    }

    const component = TestBed.runInInjectionContext(
      () => new CounterComponent(),
    );
    const increment = component.increment;

    expect(increment(2)).toBe(2);
    expect(component.counter()).toBe(2);
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'increment',
      expect.objectContaining({
        from: ['increment'],
        trace: expect.any(String),
      }),
    );
  });

  it('should support the receiver-based overload when called as an instance method', () => {
    class CounterComponent {
      readonly counter = signal(0);

      readonly increment = craftMethod(
        'increment',
        function* (this: CounterComponent, step: number = 1) {
          this.counter.update((value) => value + step);
          return this.counter();
        },
      );
    }

    const component = TestBed.runInInjectionContext(
      () => new CounterComponent(),
    );

    expect(component.increment(3)).toBe(3);
    expect(component.counter()).toBe(3);
  });

  it('should keep the this-capturing overload callable after extraction', () => {
    class CounterComponent {
      readonly counter = signal(0);

      readonly increment = craftMethod(
        'increment',
        this,
        function* (step: number = 1) {
          this.counter.update((value) => value + step);
          return this.counter();
        },
      );
    }

    const component = TestBed.runInInjectionContext(
      () => new CounterComponent(),
    );
    const increment = component.increment;

    expect(increment(4)).toBe(4);
    expect(component.counter()).toBe(4);
  });

  it('should compose craftService dependencies through XToYield()', () => {
    const { CounterWorkerToYield } = craftService(
      { name: 'CounterWorker', scope: 'function' },
      () => ({
        increment: (value: number, step: number) => value + step,
      }),
    );

    class CounterComponent {
      readonly counter = signal(0);

      readonly increment = craftMethod(
        'increment',
        this,
        function* (step: number = 1) {
          const worker = yield* CounterWorkerToYield();
          this.counter.set(worker.increment(this.counter(), step));
          return this.counter();
        },
      );
    }

    const component = TestBed.runInInjectionContext(
      () => new CounterComponent(),
    );

    expect(component.increment(5)).toBe(5);
    expect(component.counter()).toBe(5);
  });

  it('should reject onAppStart(...) inside craftMethod generators', () => {
    class InvalidComponent {
      readonly increment = craftMethod('increment', this, function* () {
        yield* onAppStart(() => undefined);
      });
    }

    const component = TestBed.runInInjectionContext(
      () => new InvalidComponent(),
    );

    expect(() => component.increment()).toThrow(
      'craftMethod(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
    );
  });

  it('should preserve overload types', () => {
    class CounterComponent {
      readonly counter = signal(0);

      readonly increment = craftMethod(
        'increment',
        this,
        function* (step: number) {
          this.counter.update((value) => value + step);
          return this.counter();
        },
      );

      readonly decrement = craftMethod(
        'decrement',
        function* (this: CounterComponent, step: number) {
          this.counter.update((value) => value - step);
          return this.counter();
        },
      );
    }

    const component = TestBed.runInInjectionContext(
      () => new CounterComponent(),
    );

    expectTypeOf(component.increment).toMatchTypeOf<(step: number) => number>();
    expectTypeOf(component.decrement).toMatchTypeOf<
      (this: CounterComponent, step: number) => number
    >();
  });

  it('should expose craftMethod dependencies through ExtractDeps', () => {
    const { CounterWorkerToYield } = craftService(
      { name: 'CounterWorker', scope: 'function' },
      () => ({
        increment: (value: number, step: number) => value + step,
      }),
    );

    class CounterComponent {
      readonly counter = signal(0);

      readonly increment = craftMethod(
        'increment',
        this,
        function* (step: number = 1) {
          const worker = yield* CounterWorkerToYield();
          this.counter.set(worker.increment(this.counter(), step));
          return this.counter();
        },
      );
    }

    type ExpectedDeps = {
      CounterWorker: GetToYieldServiceDependencies<typeof CounterWorkerToYield>;
    };
    type _Deps = Expect<
      Equal<ExtractDeps<CounterComponent['increment']>, ExpectedDeps>
    >;
  });
});

describe('craftMethod — object config with providers', () => {
  it('providers are applied when using object config form', () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('method-call');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    TestBed.runInInjectionContext(() => {
      const increment = craftMethod(
        {
          name: 'increment',
          providers: [
            provideFnWrapper(
              'Warning: dependency injection here is not type-safe and may fail at runtime',
              trackingWrapper,
            ),
          ],
        },
        function* (step: number) {
          return step + 1;
        },
      );

      expect(callLog).toEqual([]);
      increment(1);
      expect(callLog).toEqual(['method-call']);
      increment(2);
      expect(callLog).toEqual(['method-call', 'method-call']);
    });
  });

  it('providers scoped to one craftMethod do not affect sibling methods', () => {
    const callLog: string[] = [];
    const trackingWrapper: FnWrapper = function* (factory, thisArg, args) {
      callLog.push('called');
      return yield* (
        factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
      ).apply(thisArg as object, args);
    };

    TestBed.runInInjectionContext(() => {
      const withProvider = craftMethod(
        {
          name: 'withProvider',
          providers: [
            provideFnWrapper(
              'Warning: dependency injection here is not type-safe and may fail at runtime',
              trackingWrapper,
            ),
          ],
        },
        function* (x: number) {
          return x;
        },
      );
      const withoutProvider = craftMethod(
        'withoutProvider',
        function* (x: number) {
          return x;
        },
      );

      withoutProvider(1);
      expect(callLog).toEqual([]);

      withProvider(1);
      expect(callLog).toEqual(['called']);
    });
  });

  it('typing: satisfied BrandedServiceProvider deps are removed from ExtractDeps', () => {
    const { MethodWorkerToYield, provideMethodWorker } = craftService(
      { name: 'MethodWorker', scope: 'toProvide' },
      () => ({ compute: (x: number) => x * 2 }),
    );

    TestBed.runInInjectionContext(() => {
      const withoutProviders = craftMethod('compute', function* (x: number) {
        const worker = yield* MethodWorkerToYield();
        return worker.compute(x);
      });
      type WithoutDeps = ExtractDeps<typeof withoutProviders>;
      expectTypeOf<
        'MethodWorker' extends keyof WithoutDeps ? true : false
      >().toEqualTypeOf<true>();

      const withProviders = craftMethod(
        { name: 'compute', providers: [provideMethodWorker()] },
        function* (x: number) {
          const worker = yield* MethodWorkerToYield();
          return worker.compute(x);
        },
      );
      type WithDeps = ExtractDeps<typeof withProviders>;
      expectTypeOf<
        'MethodWorker' extends keyof WithDeps ? true : false
      >().toEqualTypeOf<false>();
    });
  });
});
