import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { createAngularTest, mock, real } from './create-angular-test';
import { service } from './service';
import { state } from './state';

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

describe('createAngularTest', () => {
  it('should keep metadata as a secondary createAngularTest entry', () => {
    const { injectCounter: Counter, CounterToYield, COUNTER_META_DATA } =
      service({ name: 'Counter', scope: 'toProvide' }, () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
      );

    const { COUNTER_EXTENDED_META_DATA } = service(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
        };
      },
    );

    const rootCallable = vi.fn(() => 14);

    const { sut, mocks } = createAngularTest(COUNTER_EXTENDED_META_DATA, {
      Counter: mock({
        $self: rootCallable,
        increment: vi.fn(),
      }),
    });

    expect(COUNTER_META_DATA.inject).toBe(Counter);
    expect(sut.read()).toBe(14);
    expect(mocks.Counter()).toBe(14);
  });

  it('should fail at typing time when a required child service is not covered', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterExtended: CounterExtended } = service(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        return yield* CounterToYield();
      },
    );

    if (false) {
      //@ts-expect-error Counter should be covered because it is a toProvide dependency
      createAngularTest(CounterExtended, {});
    }
  });

  it('should enable a mocked ancestor to prune a branch of required descendants', () => {
    const { ChildCounterToYield } = service(
      { name: 'ChildCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectParentCounter: ParentCounter, ParentCounterToYield } = service(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const counter = yield* ChildCounterToYield();

        return {
          increment: counter.increment,
        };
      },
    );

    const { injectRootCounter: RootCounter } = service(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        return yield* ParentCounterToYield();
      },
    );

    const testRef = createAngularTest(RootCounter, {
      ParentCounter: mock({
        increment: vi.fn(),
      }),
    });

    expect(ParentCounter).toBeDefined();
    expect(testRef.mocks.ParentCounter.increment).toBeTypeOf('function');
  });

  it('should still require descendants when a service is provided as real', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectParentCounter: ParentCounter, ParentCounterToYield } = service(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          increment: counter.increment,
        };
      },
    );

    const { injectRootCounter: RootCounter } = service(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        return yield* ParentCounterToYield();
      },
    );

    if (false) {
      //@ts-expect-error Counter should remain required because ParentCounter is real and does not prune its children
      createAngularTest(RootCounter, {
        ParentCounter: real(),
      });
    }

    if (false) {
      //@ts-expect-error Counter should remain required because ParentCounter is real and does not prune its children
      createAngularTest(RootCounter, {
        ParentCounter: real(ParentCounter),
      });
    }
  });

  it('should not require overriding a global dependency', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterConsumer: CounterConsumer } = service(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const { sut } = createAngularTest(CounterConsumer, {});

    expect(sut.read()).toBe(10);
    sut.increment();
    expect(sut.read()).toBe(11);
  });

  it('should allow mocking a global dependency with an implicit mock override', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterConsumer: CounterConsumer } = service(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = createAngularTest(CounterConsumer, {
      Counter: mock({
        $self: rootCallable,
        increment,
      }),
    });

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(mocks.Counter()).toBe(41);
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect('$self' in mocks.Counter).toBe(false);
    //@ts-expect-error $self should never be part of the public mock
    expect(mocks.Counter.$self).toBeUndefined();
  });

  it('should allow mocking a global dependency with the explicit inject helper fallback', () => {
    const { injectCounter: Counter, CounterToYield } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterConsumer: CounterConsumer } = service(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const rootCallable = vi.fn(() => 41);
    const increment = vi.fn();

    const { sut, mocks } = createAngularTest(CounterConsumer, {
      Counter: mock(Counter, {
        $self: rootCallable,
        increment,
      }),
    });

    expect(sut.read()).toBe(41);
    sut.increment();
    expect(mocks.Counter()).toBe(41);
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect('$self' in mocks.Counter).toBe(false);
    //@ts-expect-error $self should never be part of the public mock
    expect(mocks.Counter.$self).toBeUndefined();
  });

  it('should type derived mocks with only the used properties and keep extras optional', () => {
    const { injectCounter: Counter, CounterToYield } = service(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        })),
    );

    const { injectCounterExtended: CounterExtended } = service(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        return yield* CounterToYield(undefined, ({ $self, increment }) => ({
          $self,
          incrementCounter: increment,
        }));
      },
    );

    if (false) {
      //@ts-expect-error $self is required because the derivation uses it
      createAngularTest(CounterExtended, {
        Counter: mock({
          increment: vi.fn(),
        }),
      });
    }

    const increment = vi.fn();
    const decrement = vi.fn();
    const rootCallable = vi.fn(() => 41);

    const { sut, mocks } = createAngularTest(CounterExtended, {
      Counter: mock({
        $self: rootCallable,
        increment,
        decrement,
      }),
    });

    expect(Counter).toBeDefined();
    expectTypeOf(mocks.Counter.increment).toEqualTypeOf(increment);
    expectTypeOf(mocks.Counter()).toEqualTypeOf<number>();
    expect(sut()).toBe(41);
    sut.incrementCounter();
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
    expect(mocks.Counter.decrement).toHaveBeenCalledTimes(0);
    expect('$self' in mocks.Counter).toBe(false);
  });

  it('should keep explicit mock fallback with inject helper', () => {
    const { injectCounter: Counter, CounterToYield } = service(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterExtended: CounterExtended } = service(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          incrementThroughCounter: () => counter.increment(),
        };
      },
    );

    const increment = vi.fn();
    const rootCallable = vi.fn(() => 41);

    const { sut, mocks } = createAngularTest(CounterExtended, {
      Counter: mock(Counter, {
        $self: rootCallable,
        increment,
      }),
    });

    expect(sut.read()).toBe(41);
    sut.incrementThroughCounter();
    expect(mocks.Counter()).toBe(41);
    expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
  });

  it('should support implicit real for manuallyProvidedAtRoot dependencies', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectGlobalCounter: GlobalCounter } = service(
      { name: 'GlobalCounter', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const { sut } = createAngularTest(GlobalCounter, {
      Counter: real(),
    });

    expect(sut.read()).toBe(10);
    sut.increment();
    expect(sut.read()).toBe(11);
  });

  it('should support explicit real fallback with inject helper', () => {
    const { injectCounter: Counter, CounterToYield } = service(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectGlobalCounter: GlobalCounter } = service(
      { name: 'GlobalCounter', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const { sut } = createAngularTest(GlobalCounter, {
      Counter: real(Counter),
    });

    expect(sut.read()).toBe(10);
    sut.increment();
    expect(sut.read()).toBe(11);
  });
});
