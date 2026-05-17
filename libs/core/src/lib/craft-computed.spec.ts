import '@angular/compiler';
import { signal, type Signal } from '@angular/core';
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
} from 'vitest';
import { Equal, Expect } from 'test-type';
import type { ExtractDeps } from './branded-component/branded-component';
import { craftComputed } from './craft-computed';
import {
  craftService,
  onAppStart,
  type GetToYieldServiceDependencies,
} from './craft-service';

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

describe('craftComputed', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('should require an injection context', () => {
    class OutsideInjectionContext {
      readonly total = craftComputed('total', () => 42);
    }

    expect(() => new OutsideInjectionContext()).toThrow();
  });

  it('should work with a plain computation function', () => {
    class CounterComponent {
      readonly count = signal(0);
      readonly doubled = craftComputed('doubled', () => this.count() * 2);
    }

    const component = TestBed.runInInjectionContext(
      () => new CounterComponent(),
    );

    expect(component.doubled()).toBe(0);
    component.count.set(5);
    expect(component.doubled()).toBe(10);
  });

  it('should work with a generator factory that resolves DI deps once', () => {
    const { MultiplierToYield } = craftService(
      { name: 'Multiplier', scope: 'function' },
      () => ({ factor: 3 }),
    );

    class CounterComponent {
      readonly count = signal(0);

      readonly tripled = craftComputed('tripled', function* () {
        const multiplier = yield* MultiplierToYield();
        return () => this.count() * multiplier.factor;
      });
    }

    const component = TestBed.runInInjectionContext(
      () => new CounterComponent(),
    );

    expect(component.tripled()).toBe(0);
    component.count.set(4);
    expect(component.tripled()).toBe(12);
  });

  it('should reject onAppStart inside craftComputed generators', () => {
    class InvalidComponent {
      readonly value = craftComputed('value', function* () {
        yield* onAppStart(() => undefined);
        return () => 42;
      });
    }

    expect(() =>
      TestBed.runInInjectionContext(() => new InvalidComponent()),
    ).toThrow(
      'craftComputed(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
    );
  });

  it('should preserve Signal<T> type from plain computation', () => {
    const { MultiplierToYield } = craftService(
      { name: 'Multiplier4', scope: 'function' },
      () => ({ factor: 2 }),
    );

    class CounterComponent {
      readonly count = signal(0);
      readonly doubled = craftComputed('doubled', () => this.count() * 2);
      readonly tripled = craftComputed('tripled', function* () {
        const m = yield* MultiplierToYield();
        return () => this.count() * m.factor;
      });
    }

    const component = TestBed.runInInjectionContext(
      () => new CounterComponent(),
    );

    expectTypeOf(component.doubled).toMatchTypeOf<Signal<number>>();
    expectTypeOf(component.tripled).toMatchTypeOf<Signal<number>>();
  });

  it('should expose craftComputed dependencies through ExtractDeps', () => {
    const { MultiplierToYield } = craftService(
      { name: 'Multiplier5', scope: 'function' },
      () => ({ factor: 5 }),
    );

    class Component {
      readonly count = signal(0);
      readonly value = craftComputed('value', function* () {
        const m = yield* MultiplierToYield();
        return () => this.count() * m.factor;
      });
    }

    type ExpectedDeps = {
      Multiplier5: GetToYieldServiceDependencies<typeof MultiplierToYield>;
    };
    type _Deps = Expect<Equal<ExtractDeps<Component['value']>, ExpectedDeps>>;
  });
});
