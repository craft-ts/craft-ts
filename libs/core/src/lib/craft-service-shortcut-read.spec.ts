import { describe, expect, expectTypeOf, it } from 'vitest';
import { CraftTestBed } from './host/craft-test-bed';
import { craftService } from './craft-service';
import { craftExpose } from './craft-primitive-gen';
import { craftUse } from './craft-use';
import { craftMethod } from './craft-method';
import { state } from './state';
import { mutation } from './mutation';

const { Store, provideStore } = craftService(
  { name: 'Store', providedIn: 'toProvide' },
  function* () {
    yield* state('counter', 1, ({ update, set }) => ({
      increment: () => update((value) => value + 1),
      reset: () => set(0),
    }));
    yield* mutation('save', {
      method: (id: string) => id,
      identifier: (id: string) => id,
      loader: ({ params }) => params,
    });
  },
);

const { Holder, provideHolder } = craftService(
  { name: 'Holder', providedIn: 'toProvide' },
  function* () {
    const store = yield* Store();
    yield* craftExpose('store', store);
  },
);

const seen: Record<string, unknown> = {};

const { OneLevel, provideOneLevel } = craftService(
  { name: 'OneLevel', providedIn: 'toProvide' },
  function* () {
    seen['one level'] = yield* Store.counter();
  },
);
const { TwoLevels, provideTwoLevels } = craftService(
  { name: 'TwoLevels', providedIn: 'toProvide' },
  function* () {
    seen['two levels'] = yield* Holder.store.counter();
  },
);
const { Method, provideMethod } = craftService(
  { name: 'Method', providedIn: 'toProvide' },
  function* () {
    // Three levels deep, no argument: the method is called.
    seen['method'] = yield* Holder.store.counter.increment();
  },
);
const { AfterMethod, provideAfterMethod } = craftService(
  { name: 'AfterMethod', providedIn: 'toProvide' },
  function* () {
    seen['after method'] = yield* Store.counter();
  },
);
const { Chained, provideChained } = craftService(
  { name: 'Chained', providedIn: 'toProvide' },
  function* () {
    // A call continues the chain: the selected item's own member is read.
    seen['chained'] = yield* Store.save.selectOrCreate('a').isLoading();
  },
);
const { Resource, provideResource } = craftService(
  { name: 'Resource', providedIn: 'toProvide' },
  function* () {
    seen['resource'] = yield* Store.save();
  },
);

describe('a service shortcut reads a reactive member', () => {
  it('returns the value at any depth, calls methods, keeps resources', () => {
    CraftTestBed.configureTestingModule({
      providers: [
        provideStore(),
        provideHolder(),
        provideOneLevel(),
        provideTwoLevels(),
        provideMethod(),
        provideAfterMethod(),
        provideResource(),
        provideChained(),
      ],
    });

    CraftTestBed.runInInjectionContext(() => {
      const one = craftUse(OneLevel());
      craftUse(TwoLevels());
      craftUse(Method());
      craftUse(AfterMethod());
      craftUse(Resource());
      craftUse(Chained());

      expect(seen['one level']).toBe(1);
      expect(seen['two levels']).toBe(1);
      // increment() ran: it was called, not handed back.
      expect(seen['after method']).toBe(2);
      // A by-identifier mutation is a reader but is consumed as the resource.
      expect((seen['resource'] as { kind?: string }).kind).toBe('mutation');
      expect(seen['chained']).toBe(false);
      // Yielded alone, a member is exposed under its own name.
      expect(Object.keys(one)).toEqual(['counter']);
    });
  });

  it('types the result as the value, not the reader', () => {
    function* consumer() {
      const one = yield* Store.counter();
      const two = yield* Holder.store.counter();
      expectTypeOf(one).toEqualTypeOf<number>();
      expectTypeOf(two).toEqualTypeOf<number>();
      const loading = yield* Store.save.selectOrCreate('a').isLoading();
      expectTypeOf(loading).toEqualTypeOf<boolean>();
    }
    expect(typeof consumer).toBe('function');
  });
});

let closed = 0;
const { Closing } = craftService(
  { name: 'Closing', providedIn: 'global' },
  function* () {
    yield* craftMethod('close', function* () {
      closed += 1;
    });
    yield* craftExpose('reset', () => {
      closed = 0;
    });
  },
);
const { ClosingHolder } = craftService(
  { name: 'ClosingHolder', providedIn: 'global' },
  function* () {
    const closing = yield* Closing();
    yield* craftExpose('closing', closing);
  },
);
const { ClosingModel, provideClosingModel } = craftService(
  { name: 'ClosingModel', providedIn: 'toProvide' },
  function* () {
    yield* craftExpose('close', Closing.close);
    yield* craftExpose('deepClose', ClosingHolder.closing.close);
    yield* craftExpose('increment', Holder.store.counter.increment);
  },
);
const { CallingModel } = craftService(
  { name: 'CallingModel', providedIn: 'global' },
  function* () {
    yield* Closing.close();
    yield* ClosingHolder.closing.close();
    yield* Closing.reset();
  },
);

describe('a service shortcut onto a method', () => {
  it('runs it when called, wherever it is', () => {
    closed = 5;
    CraftTestBed.runInInjectionContext(() => {
      const model = craftUse(CallingModel());
      // close() twice, then reset(): the root function ran too.
      expect(closed).toBe(0);
      // A call exposes nothing.
      expect(Object.keys(model)).toEqual([]);
    });
  });

  it('is exposed, not run, through craftExpose without the call', () => {
    closed = 0;
    CraftTestBed.configureTestingModule({
      providers: [provideStore(), provideHolder(), provideClosingModel()],
    });
    CraftTestBed.runInInjectionContext(() => {
      const model = craftUse(ClosingModel());
      expect(closed).toBe(0);
      expect(Object.keys(model)).toEqual(['close', 'deepClose', 'increment']);

      model.close();
      model.deepClose();
      expect(closed).toBe(2);
    });
  });

  it('types the call as its result and the exposure as the method', () => {
    function* consumer() {
      const called = yield* Closing.close();
      expectTypeOf(called).toEqualTypeOf<void>();
      const model = yield* ClosingModel();
      expectTypeOf(model.close).toBeFunction();
      expectTypeOf(model.increment).toBeFunction();
    }
    expect(typeof consumer).toBe('function');
  });
});
