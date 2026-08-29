import { computed, signal } from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { craftException } from './craft-exception';
import { isCraftGenShortCircuit } from './craft-gen';
import { craftComputed } from './craft-computed';
import { craftUse } from './craft-use';
import { asyncProcess } from './async-process';
import { mutation } from './mutation';
import { query, type ResourceLikeQueryRef } from './query';
import type { ResourceExceptionConstraints } from './query.core';
import type { YieldableReactiveProperties } from './reactive-read';
import {
  CraftNotSettled,
  craftSettledValue,
  isCraftNotSettled,
  settled,
  type CraftSettledCodesOf,
  type CraftSettledSourcesOf,
  type SettleableResource,
} from './craft-settled';

interface User {
  readonly id: string;
  readonly name: string;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeResource(): {
  resource: SettleableResource;
  status: ReturnType<typeof signal<string>>;
  value: ReturnType<typeof signal<unknown>>;
  hasException: ReturnType<typeof signal<boolean>>;
  exceptions: ReturnType<typeof signal<{ list: readonly any[] }>>;
  error: ReturnType<typeof signal<Error | undefined>>;
} {
  const status = signal<string>('loading');
  const value = signal<unknown>(undefined);
  const hasException = signal(false);
  const error = signal<Error | undefined>(undefined);
  const exceptions = signal<{ list: readonly any[] }>({ list: [] });

  return {
    resource: { status, value, hasException, exceptions, error },
    status,
    value,
    hasException,
    exceptions,
    error,
  };
}

describe('craftSettledValue', () => {
  it('throws CraftNotSettled while the source is loading or idle', () => {
    const { resource, status } = makeResource();
    const settledValue = craftSettledValue<User[]>('users', resource);

    expect(() => settledValue()).toThrow(CraftNotSettled);

    status.set('idle');
    expect(() => settledValue()).toThrow(CraftNotSettled);

    try {
      settledValue();
    } catch (error) {
      expect(isCraftNotSettled(error)).toBe(true);
      expect((error as CraftNotSettled).source).toBe('users');
    }
  });

  it('returns the resolved value once the source settles', () => {
    const { resource, status, value } = makeResource();
    const settledValue = craftSettledValue<User[]>('users', resource);

    value.set([{ id: '1', name: 'Ada' }]);
    status.set('resolved');

    expect(settledValue()).toEqual([{ id: '1', name: 'Ada' }]);
  });

  it('recomputes on its own once the source settles', () => {
    const { resource, status, value } = makeResource();
    const settledValue = craftSettledValue<User[]>('users', resource);

    // The dependency on `status` is established before the throw, so the
    // computation is invalidated by the transition — no manual retry needed.
    expect(() => settledValue()).toThrow(CraftNotSettled);

    value.set([{ id: '1', name: 'Ada' }]);
    status.set('resolved');

    expect(settledValue()).toEqual([{ id: '1', name: 'Ada' }]);
  });

  it('short-circuits with the business exception through the existing channel', () => {
    const { resource, status, hasException, exceptions } = makeResource();
    const settledValue = craftSettledValue<User[]>('users', resource);
    const exception = craftException({ _tag: 'MISSING_USER_ID' });

    status.set('exception');
    hasException.set(true);
    exceptions.set({ list: [exception] });

    try {
      settledValue();
      expect.unreachable('the settled read should have thrown');
    } catch (error) {
      expect(isCraftGenShortCircuit(error)).toBe(true);
      expect(isCraftNotSettled(error)).toBe(false);
    }
  });

  it('rethrows a residual technical failure', () => {
    const { resource, status, error } = makeResource();
    const settledValue = craftSettledValue<User[]>('users', resource);

    status.set('exception');
    error.set(new Error('boom'));

    expect(() => settledValue()).toThrow('boom');
  });
});

describe('settledValue on query', () => {
  it('is attached to a resource-like query ref and reads through', async () => {
    await TestBed.runInInjectionContext(async () => {
      const users = craftUse(
        query('users', {
          params: () => true,
          loader: async (): Promise<User[]> => [{ id: '1', name: 'Ada' }],
        }),
      );

      expect(() => craftUse(users.settledValue())).toThrow(CraftNotSettled);

      await vi.runAllTimersAsync();

      expect(craftUse(users.settledValue())).toEqual([
        { id: '1', name: 'Ada' },
      ]);
      expect(craftUse(users.resource.settledValue())).toEqual([
        { id: '1', name: 'Ada' },
      ]);
    });
  });

  it('serves the preserved value during a reload instead of suspending', async () => {
    await TestBed.runInInjectionContext(async () => {
      const currentId = signal('first');
      const users = craftUse(
        query('users', {
          params: () => currentId(),
          loader: async ({ params }): Promise<User[]> => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return [{ id: params, name: 'Ada' }];
          },
        }),
      );

      await vi.runAllTimersAsync();
      expect(craftUse(users.settledValue())).toEqual([
        { id: 'first', name: 'Ada' },
      ]);

      currentId.set('second');
      expect(craftUse(users.status())).toBe('loading');
      // Stale-while-revalidate: a refetch must not blank a filled screen.
      expect(craftUse(users.settledValue())).toEqual([
        { id: 'first', name: 'Ada' },
      ]);

      await vi.runAllTimersAsync();
      expect(craftUse(users.settledValue())).toEqual([
        { id: 'second', name: 'Ada' },
      ]);
    });
  });

  it('brands the settled read with its source name and exception codes', () => {
    const _users = () =>
      craftUse(
        query('users', {
          params: () =>
            Math.random() > 0.5
              ? true
              : craftException({ _tag: 'MISSING_USER_ID' }),
          loader: async (): Promise<User[]> => [],
        }),
      );

    type SettledSignal = ReturnType<typeof _users>['settledValue'];

    expectTypeOf<
      CraftSettledSourcesOf<SettledSignal>
    >().toEqualTypeOf<'users'>();
    expectTypeOf<
      CraftSettledCodesOf<SettledSignal>
    >().toEqualTypeOf<'MISSING_USER_ID'>();
  });

  it('keeps a ref inferable through its alias (no intersection wrapper)', () => {
    // Regression: `settledValue` was first added as an INTERSECTION on the ref
    // type (`Ref & { settledValue }`). TypeScript cannot infer a generic type
    // argument through an intersection, so every helper that takes a ref and
    // infers its parameters — `insertReactOnMutation` among them — silently
    // inferred `unknown` everywhere and then failed to type-check its callers.
    // `settledValue` must stay a plain member of the ref type.
    const inferParams = <
      Value,
      Params,
      ArgParams,
      SourceParams,
      Insertions,
      Exceptions extends ResourceExceptionConstraints,
    >(
      _ref: YieldableReactiveProperties<
        ResourceLikeQueryRef<
          Value,
          Params,
          true,
          ArgParams,
          SourceParams,
          Insertions,
          Exceptions
        >
      >,
    ): Params => undefined as Params;

    const _inferred = () => {
      const users = craftUse(
        query('users', {
          method: (id: string) => id,
          loader: async ({ params }): Promise<{ id: string }> => ({
            id: params,
          }),
        }),
      );

      return inferParams(users);
    };

    expectTypeOf<ReturnType<typeof _inferred>>().toEqualTypeOf<string>();
  });

  it('leaves an unbranded signal free of any obligation', () => {
    const _plain = signal(0);

    expectTypeOf<CraftSettledSourcesOf<typeof _plain>>().toBeNever();
    expectTypeOf<CraftSettledCodesOf<typeof _plain>>().toBeNever();
  });
});

describe('settledValue on mutation and asyncProcess', () => {
  it('suspends a mutation until it settles', async () => {
    await TestBed.runInInjectionContext(async () => {
      const save = craftUse(
        mutation('save', {
          method: (name: string) => name,
          loader: async ({ params }): Promise<{ name: string }> => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { name: params };
          },
        }),
      );

      expect(() => craftUse(save.settledValue())).toThrow(CraftNotSettled);

      save.mutate('Ada');
      await vi.runAllTimersAsync();

      expect(craftUse(save.settledValue())).toEqual({ name: 'Ada' });
    });
  });

  it('suspends an async process until it settles', async () => {
    await TestBed.runInInjectionContext(async () => {
      const compute = craftUse(
        asyncProcess('compute', {
          method: (value: number) => value,
          loader: async ({ params }): Promise<{ doubled: number }> => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { doubled: params * 2 };
          },
        }),
      );

      expect(() => craftUse(compute.settledValue())).toThrow(CraftNotSettled);

      compute.method(21);
      await vi.runAllTimersAsync();

      expect(craftUse(compute.settledValue())).toEqual({ doubled: 42 });
    });
  });

  it('brands both with their own source name', () => {
    const _refs = () => {
      const save = craftUse(
        mutation('save', {
          method: (name: string) => name,
          loader: async ({ params }): Promise<{ name: string }> => ({
            name: params,
          }),
        }),
      );
      const compute = craftUse(
        asyncProcess('compute', {
          method: (value: number) => value,
          loader: async ({ params }): Promise<{ doubled: number }> => ({
            doubled: params,
          }),
        }),
      );

      return { save, compute };
    };

    type Refs = ReturnType<typeof _refs>;

    expectTypeOf<
      CraftSettledSourcesOf<Refs['save']['settledValue']>
    >().toEqualTypeOf<'save'>();
    expectTypeOf<
      CraftSettledSourcesOf<Refs['compute']['settledValue']>
    >().toEqualTypeOf<'compute'>();
  });

  it('exposes settledValue on by-id selections', async () => {
    await TestBed.runInInjectionContext(async () => {
      const users = craftUse(
        query('usersById', {
          params: () => ({ id: 'ada' }),
          identifier: (params: { id: string }) => params.id,
          loader: async ({ params }): Promise<User> => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { id: params.id, name: 'Ada' };
          },
        }),
      );

      const selected = users.selectOrCreate('ada');
      expect(() => craftUse(selected.settledValue())).toThrow(CraftNotSettled);

      await vi.runAllTimersAsync();
      expect(craftUse(selected.settledValue())).toEqual({
        id: 'ada',
        name: 'Ada',
      });
    });
  });

  it('exposes settledValue on mutation and asyncProcess by-id selections', async () => {
    await TestBed.runInInjectionContext(async () => {
      const save = craftUse(
        mutation('saveById', {
          method: (id: string) => ({ id }),
          identifier: (params) => params.id,
          loader: async ({ params }): Promise<User> => ({
            id: params.id,
            name: 'Ada',
          }),
        }),
      );
      const compute = craftUse(
        asyncProcess('computeById', {
          method: (id: string) => ({ id }),
          identifier: (params) => params.id,
          loader: async ({ params }): Promise<User> => ({
            id: params.id,
            name: 'Ada',
          }),
        }),
      );

      save.mutate('ada');
      compute.method('ada');
      await vi.runAllTimersAsync();

      expect(craftUse(save.select('ada')!.settledValue())).toEqual({
        id: 'ada',
        name: 'Ada',
      });
      expect(craftUse(compute.selectOrCreate('ada').settledValue())).toEqual({
        id: 'ada',
        name: 'Ada',
      });
    });
  });
});

describe('settledState in resource insertions', () => {
  it('propagates pending and exception markers through a derived craftComputed', () => {
    TestBed.runInInjectionContext(() => {
      query(
        'typedSettledState',
        {
          params: () => true,
          loader: async (): Promise<User[]> => [],
        },
        function* ({ settledState }) {
          const derived = craftComputed('derivedSettledState', function* () {
            return (yield* settledState()).length;
          });
          expectTypeOf<
            CraftSettledSourcesOf<typeof derived>
          >().toEqualTypeOf<'typedSettledState'>();
          return {};
        },
      );
    });
  });

  it('returns a non-nullable value through yield* and suspends until resolution', async () => {
    await TestBed.runInInjectionContext(async () => {
      const users = craftUse(
        query(
          'usersForSettledState',
          {
            params: () => true,
            loader: async (): Promise<User[]> => {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              return [{ id: 'ada', name: 'Ada' }];
            },
          },
          ({ settledState }) => ({
            firstSettledUser: computed(() => {
              const value = craftUse(settledState());
              expectTypeOf(value).toEqualTypeOf<User[]>();
              return value[0]?.name ?? '';
            }),
          }),
        ),
      );

      expect(() => craftUse(users.firstSettledUser())).toThrow(CraftNotSettled);
      await vi.runAllTimersAsync();
      expect(craftUse(users.firstSettledUser())).toBe('Ada');
    });
  });

  it('reads the settled value of the current by-id resource', async () => {
    await TestBed.runInInjectionContext(async () => {
      const users = craftUse(
        query(
          'usersForSettledStateById',
          {
            params: () => ({ id: 'ada' }),
            identifier: (params) => params.id,
            loader: async ({ params }): Promise<User> => ({
              id: params.id,
              name: 'Ada',
            }),
          },
          ({ settledState }) => ({
            settledUserName: computed(() => craftUse(settledState()).name),
          }),
        ),
      );

      expect(() => craftUse(users.settledUserName())).toThrow(CraftNotSettled);
      await vi.runAllTimersAsync();
      expect(craftUse(users.settledUserName())).toBe('Ada');
    });
  });
});

describe('settled() inside craftComputed', () => {
  it('propagates the source and its exception codes onto the computed', () => {
    const _activeUsers = () => {
      const users = craftUse(
        query('users', {
          params: () =>
            Math.random() > 0.5
              ? true
              : craftException({ _tag: 'MISSING_USER_ID' }),
          loader: async (): Promise<User[]> => [],
        }),
      );

      return craftComputed('activeUsers', function* () {
        const list = yield* settled(users);
        // The settled read is non-undefined and exception-free here.
        expectTypeOf(list).toEqualTypeOf<User[]>();
        return list.length;
      });
    };

    type Computed = ReturnType<typeof _activeUsers>;

    expectTypeOf<CraftSettledSourcesOf<Computed>>().toEqualTypeOf<'users'>();
    expectTypeOf<
      CraftSettledCodesOf<Computed>
    >().toEqualTypeOf<'MISSING_USER_ID'>();
  });

  it('leaves a computed with no async dependency unbranded', () => {
    const _plain = () => craftComputed('plain', () => 1);

    expectTypeOf<
      CraftSettledSourcesOf<ReturnType<typeof _plain>>
    >().toEqualTypeOf<never>();
  });
});
