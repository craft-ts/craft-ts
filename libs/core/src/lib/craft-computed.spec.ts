import {
  computed,
  signal,
} from './host/craft-compat';
import { CraftTestBed } from './host/craft-test-bed';
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
import { craftComputed } from './craft-computed';
import {
  craftService,
  onAppStart,
  type GetServiceDependencies,
} from './craft-service';
import type { YieldableReactiveValue } from './reactive-read';
import { craftUse } from './craft-use';
import { craftSignal } from './host/craft-signal';
import { craftExpose } from './craft-primitive-gen';

describe('craftComputed', () => {
  beforeEach(() => {
    CraftTestBed.resetTestingModule();
  });

  it('should require an injection context', () => {
    class OutsideInjectionContext {
      readonly total = craftUse(craftComputed('total', () => 42));
    }

    expect(() => new OutsideInjectionContext()).toThrow();
  });

  it('should work with a plain computation function', () => {
    class CounterComponent {
      readonly count = signal(0);
      readonly doubled = craftUse(craftComputed('doubled', () => this.count() * 2));
    }

    const component = CraftTestBed.runInInjectionContext(
      () => new CounterComponent(),
    );

    expect(craftUse(component.doubled())).toBe(0);
    component.count.set(5);
    expect(craftUse(component.doubled())).toBe(10);
  });

  it('memoizes repeated reads until a dependency changes', () => {
    const computation = vi.fn(() => 42);
    const value = CraftTestBed.runInInjectionContext(() =>
      craftUse(craftComputed('value', computation)),
    );

    expect(craftUse(value())).toBe(42);
    const callsAfterFirstRead = computation.mock.calls.length;
    expect(craftUse(value())).toBe(42);

    expect(computation).toHaveBeenCalledTimes(callsAfterFirstRead);
  });

  it('evaluates once per invalidation for an computed consumer', () => {
    const craftSource = craftSignal(2);
    const otherSource = signal(3);
    const computation = vi.fn(() => craftSource() * otherSource());
    const value = CraftTestBed.runInInjectionContext(() =>
      craftUse(craftComputed('single-evaluation', computation)),
    );
    const consumer = computed(() => craftUse(value()));

    expect(consumer()).toBe(6);
    expect(computation).toHaveBeenCalledTimes(1);

    expect(consumer()).toBe(6);
    expect(computation).toHaveBeenCalledTimes(1);

    craftSource.set(4);
    expect(computation).toHaveBeenCalledTimes(1);
    expect(consumer()).toBe(12);
    expect(computation).toHaveBeenCalledTimes(2);

    otherSource.set(5);
    expect(consumer()).toBe(20);
    expect(computation).toHaveBeenCalledTimes(3);
  });

  it('invalidates an computed when a Craft dependency changes', () => {
    const source = craftSignal(2);
    const value = CraftTestBed.runInInjectionContext(() =>
      craftUse(craftComputed('value', () => source() * 3)),
    );
    const consumer = computed(() => craftUse(value()));

    expect(consumer()).toBe(6);

    source.set(4);

    expect(consumer()).toBe(12);
  });

  it('recovers an consumer after a thrown first evaluation', () => {
    const ready = craftSignal(false);
    const value = CraftTestBed.runInInjectionContext(() =>
      craftUse(craftComputed('recover', () => {
        if (!ready()) {
          throw new Error('not ready');
        }
        return 'recovered';
      })),
    );
    const consumer = computed(() => craftUse(value()));

    expect(() => consumer()).toThrow('not ready');

    ready.set(true);

    expect(consumer()).toBe('recovered');
  });

  it('retraces conditional dependencies after a Craft branch switch', () => {
    const useSecond = craftSignal(false);
    const first = signal('first');
    const second = signal('second');
    const value = CraftTestBed.runInInjectionContext(() =>
      craftUse(craftComputed('conditional', () => (useSecond() ? second() : first()))),
    );
    const consumer = computed(() => craftUse(value()));

    expect(consumer()).toBe('first');

    useSecond.set(true);
    expect(consumer()).toBe('second');

    second.set('updated');

    expect(consumer()).toBe('updated');
  });

  it('stays lazy after an unread Craft invalidation', () => {
    const source = craftSignal(1);
    const computation = vi.fn(() => source() * 2);
    const value = CraftTestBed.runInInjectionContext(() =>
      craftUse(craftComputed('lazy', computation)),
    );

    expect(craftUse(value())).toBe(2);
    const callsAfterRead = computation.mock.calls.length;

    source.set(2);

    expect(computation).toHaveBeenCalledTimes(callsAfterRead);
  });

  it('should work with a generator factory that resolves DI deps once', () => {
    const { Multiplier } = craftService(
      { name: 'Multiplier', providedIn: 'function' },
      function* () {
        yield* craftExpose('factor', 3);
      },
    );

    class CounterComponent {
      readonly count = signal(0);

      // The host form binds `this` inside the generator (and the computation
      // it returns) to the component instance.
      readonly tripled = craftUse(craftComputed('tripled', this, function* () {
        const multiplier = yield* Multiplier();
        return this.count() * multiplier.factor;
      }));
    }

    const component = CraftTestBed.runInInjectionContext(
      () => new CounterComponent(),
    );

    expect(craftUse(component.tripled())).toBe(0);
    component.count.set(4);
    expect(craftUse(component.tripled())).toBe(12);
  });

  it('should reject onAppStart inside craftComputed generators', () => {
    class InvalidComponent {
      readonly value = craftUse(craftComputed('value', function* () {
        yield* onAppStart(() => undefined);
        return 42;
      }));
    }

    const component = CraftTestBed.runInInjectionContext(
      () => new InvalidComponent(),
    );
    expect(() => craftUse(component.value())).toThrow(
      'craftComputed(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
    );
  });

  it('should preserve Signal<T> type from plain computation', () => {
    const { Multiplier4 } = craftService(
      { name: 'Multiplier4', providedIn: 'function' },
      function* () {
        yield* craftExpose('factor', 2);
      },
    );

    class CounterComponent {
      readonly count = signal(0);
      readonly doubled = craftUse(craftComputed('doubled', () => this.count() * 2));
      readonly tripled = craftUse(craftComputed('tripled', this, function* () {
        const m = yield* Multiplier4();
        return this.count() * m.factor;
      }));
    }

    const component = CraftTestBed.runInInjectionContext(
      () => new CounterComponent(),
    );

    expectTypeOf(component.doubled).toMatchTypeOf<
      YieldableReactiveValue<number>
    >();
    expectTypeOf(component.tripled).toMatchTypeOf<
      YieldableReactiveValue<number>
    >();

    type _PlainComputedIsYieldable = Expect<
      CounterComponent['doubled'] extends YieldableReactiveValue<number>
        ? true
        : false
    >;
    type _GeneratorComputedIsYieldable = Expect<
      CounterComponent['tripled'] extends YieldableReactiveValue<number>
        ? true
        : false
    >;
  });

  it('should expose craftComputed dependencies through ExtractDeps', () => {
    const { Multiplier5 } = craftService(
      { name: 'Multiplier5', providedIn: 'function' },
      function* () {
        yield* craftExpose('factor', 5);
      },
    );

    class Component {
      readonly count = signal(0);
      readonly value = craftUse(craftComputed('value', this, function* () {
        const m = yield* Multiplier5();
        return this.count() * m.factor;
      }));
    }

    type ExpectedDeps = {
      Multiplier5: GetServiceDependencies<typeof Multiplier5>;
    };
    type _Deps = Expect<Equal<ExtractDeps<Component['value']>, ExpectedDeps>>;
  });
});
