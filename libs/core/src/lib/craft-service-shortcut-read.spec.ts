import { describe, expect, expectTypeOf, it } from 'vitest';
import { TestBed } from './host/craft-test-bed';
import { craftService } from './craft-service';
import { craftUse } from './craft-use';
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
    yield* Store();
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
    TestBed.configureTestingModule({
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

    TestBed.runInInjectionContext(() => {
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
