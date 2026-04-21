import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { craftService } from './craft-service';
import { state } from './state';
import { ToRegister } from './to-register';

describe('ToRegister', () => {
  it('should expose one flat exhaustive key per service in the graph', () => {
    const { ChildCounterToYield, provideChildCounter } = craftService(
      { name: 'ChildCounter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { ParentCounterToYield, provideParentCounter } = craftService(
      { name: 'ParentCounter', scope: 'toProvide' },
      function* () {
        const child = yield* ChildCounterToYield();

        return {
          incrementParent: () => child.increment(),
        };
      },
    );

    const { injectRootCounter, provideRootCounter } = craftService(
      { name: 'RootCounter', scope: 'toProvide' },
      function* () {
        const parent = yield* ParentCounterToYield();

        return {
          incrementRoot: () => parent.incrementParent(),
        };
      },
    );

    type Register = ToRegister<typeof injectRootCounter>;

    expectTypeOf<keyof Register>().toEqualTypeOf<
      'RootCounter' | 'ParentCounter' | 'ChildCounter'
    >();

    const register: Register = {
      RootCounter: provideRootCounter(),
      ParentCounter: provideParentCounter(),
      ChildCounter: provideChildCounter(),
    };

    expect(register.RootCounter).toBeDefined();
  });

  it('should accept real globals, mocks and notReached markers with exact keys', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

    const { injectCounterConsumer, provideCounterConsumer } = craftService(
      { name: 'CounterConsumer', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          read: () => counter(),
          increment: () => counter.increment(),
        };
      },
    );

    const register: ToRegister<typeof injectCounterConsumer> = {
      CounterConsumer: provideCounterConsumer(),
      Counter: 'real',
    };

    expect(register.Counter).toBe('real');

    const mockedRegister: ToRegister<typeof injectCounterConsumer> = {
      CounterConsumer: provideCounterConsumer(),
      Counter: {
        $self: vi.fn(() => 42),
        increment: vi.fn(),
      },
    };

    expect(mockedRegister.Counter).toBeDefined();

    if (false) {
      //@ts-expect-error missing Counter entry
      const _missing: ToRegister<typeof injectCounterConsumer> = {
        CounterConsumer: provideCounterConsumer(),
      };

      const _extra: ToRegister<typeof injectCounterConsumer> = {
        CounterConsumer: provideCounterConsumer(),
        Counter: 'real',
        //@ts-expect-error extra keys are rejected
        ExtraCounter: 'notReached',
      };

      const _providerOnGlobal: ToRegister<typeof injectCounterConsumer> = {
        CounterConsumer: provideCounterConsumer(),
        //@ts-expect-error global entries cannot receive providers
        Counter: provideCounterConsumer(),
      };

      const _mockedRoot: ToRegister<typeof injectCounterConsumer> = {
        CounterConsumer: {
          //@ts-expect-error root entries cannot be mocked
          read: vi.fn(() => 1),
          increment: vi.fn(),
        },
        Counter: 'real',
      };

      expect(_missing).toBeDefined();
      expect(_extra).toBeDefined();
      expect(_providerOnGlobal).toBeDefined();
      expect(_mockedRoot).toBeDefined();
    }
  });

  it('should merge derived properties from repeated usages of the same dependency', () => {
    const { ApiServiceToYield } = craftService(
      { name: 'ApiService', scope: 'global' },
      () => ({
        getDataList: async () => ['a'],
        updateItem: async (item: { id: number }) => item,
        deleteItem: async (id: number) => id,
      }),
    );

    const { injectFeature, provideFeature } = craftService(
      { name: 'Feature', scope: 'toProvide' },
      function* () {
        const { getDataList } = yield* ApiServiceToYield(
          undefined,
          ({ getDataList }) => ({ getDataList }),
        );
        const { updateItem } = yield* ApiServiceToYield(
          undefined,
          ({ updateItem }) => ({ updateItem }),
        );

        return {
          refresh: async () => getDataList(),
          save: async () => updateItem({ id: 1 }),
        };
      },
    );

    const register: ToRegister<typeof injectFeature> = {
      Feature: provideFeature(),
      ApiService: {
        getDataList: vi.fn(async () => ['a']),
        updateItem: vi.fn(async (item: { id: number }) => item),
      },
    };

    expect(register.ApiService).toBeDefined();

    if (false) {
      const _missingMergedField: ToRegister<typeof injectFeature> = {
        Feature: provideFeature(),
        //@ts-expect-error repeated derived usages must merge into one required mock shape
        ApiService: {
          getDataList: vi.fn(async () => ['a']),
        },
      };

      expect(_missingMergedField).toBeDefined();
    }
  });

  it('should require a full service mock when derived and non-derived usages are mixed', () => {
    const { ApiServiceToYield } = craftService(
      { name: 'ApiService', scope: 'global' },
      () => ({
        getDataList: async () => ['a'],
        updateItem: async (item: { id: number }) => item,
        deleteItem: async (id: number) => id,
      }),
    );

    const { injectFeature, provideFeature } = craftService(
      { name: 'Feature', scope: 'toProvide' },
      function* () {
        const api = yield* ApiServiceToYield();
        const { updateItem } = yield* ApiServiceToYield(
          undefined,
          ({ updateItem }) => ({ updateItem }),
        );

        return {
          refresh: async () => api.getDataList(),
          save: async () => updateItem({ id: 1 }),
          remove: async () => api.deleteItem(1),
        };
      },
    );

    const register: ToRegister<typeof injectFeature> = {
      Feature: provideFeature(),
      ApiService: {
        getDataList: vi.fn(async () => ['a']),
        updateItem: vi.fn(async (item: { id: number }) => item),
        deleteItem: vi.fn(async (id: number) => id),
      },
    };

    expect(register.ApiService).toBeDefined();

    if (false) {
      const _subsetOnly: ToRegister<typeof injectFeature> = {
        Feature: provideFeature(),
        //@ts-expect-error a non-derived usage must switch the dependency to a full service mock
        ApiService: {
          getDataList: vi.fn(async () => ['a']),
          updateItem: vi.fn(async (item: { id: number }) => item),
        },
      };

      expect(_subsetOnly).toBeDefined();
    }
  });

  it('should merge callable root derivations with method derivations', () => {
    const { CounterToYield } = craftService(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        })),
    );

    const { injectCounterFeature, provideCounterFeature } = craftService(
      { name: 'CounterFeature', scope: 'toProvide' },
      function* () {
        const counter = yield* CounterToYield(undefined, ({ $self }) => ({
          $self,
        }));
        const { incrementCounter } = yield* CounterToYield(
          undefined,
          ({ increment }) => ({
            incrementCounter: increment,
          }),
        );

        return {
          read: () => counter(),
          incrementCounter,
        };
      },
    );

    const register: ToRegister<typeof injectCounterFeature> = {
      CounterFeature: provideCounterFeature(),
      Counter: {
        $self: vi.fn(() => 41),
        increment: vi.fn(),
      },
    };

    expect(register.Counter).toBeDefined();

    if (false) {
      const _missingRoot: ToRegister<typeof injectCounterFeature> = {
        CounterFeature: provideCounterFeature(),
        //@ts-expect-error callable root access must be merged with method derivations
        Counter: {
          increment: vi.fn(),
        },
      };

      expect(_missingRoot).toBeDefined();
    }
  });

  it('should merge derived usages globally across sibling branches', () => {
    const { ApiServiceToYield } = craftService(
      { name: 'ApiService', scope: 'global' },
      () => ({
        getDataList: async () => ['a'],
        getDataList: async () => ['a'],
        updateItem: async (item: { id: number }) => item,
      }),
    );

    const { LeftFeatureToYield, provideLeftFeature } = craftService(
      { name: 'LeftFeature', scope: 'toProvide' },
      function* () {
        return yield* ApiServiceToYield(undefined, ({ getDataList }) => ({
          getDataList,
        }));
      },
    );

    const { RightFeatureToYield, provideRightFeature } = craftService(
      { name: 'RightFeature', scope: 'toProvide' },
      function* () {
        return yield* ApiServiceToYield(undefined, ({ updateItem }) => ({
          updateItem,
        }));
      },
    );

    const { injectRootFeature, provideRootFeature } = craftService(
      { name: 'RootFeature', scope: 'toProvide' },
      function* () {
        const left = yield* LeftFeatureToYield();
        const right = yield* RightFeatureToYield();

        return {
          left,
          right,
        };
      },
    );

    const register: ToRegister<typeof injectRootFeature> = {
      RootFeature: provideRootFeature(),
      LeftFeature: provideLeftFeature(),
      RightFeature: provideRightFeature(),
      ApiService: {
        getDataList: vi.fn(async () => ['a']),
        updateItem: vi.fn(async (item: { id: number }) => item),
      },
    };

    expect(register.ApiService).toBeDefined();

    if (false) {
      const _missingBranchMerge: ToRegister<typeof injectRootFeature> = {
        RootFeature: provideRootFeature(),
        LeftFeature: provideLeftFeature(),
        RightFeature: provideRightFeature(),
        //@ts-expect-error derived usages must merge even when they come from different branches
        ApiService: {
          getDataList: vi.fn(async () => ['a']),
        },
      };

      expect(_missingBranchMerge).toBeDefined();
    }
  });
});
