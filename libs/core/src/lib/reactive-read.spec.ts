import { provideCraftRouter } from './craft-router';
import {
  signal,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { craftComputed } from './craft-computed';
import { craftException } from './craft-exception';
import { craftUse } from './craft-use';
import { insertStatePipe } from './insert-typed-pipes';
import {
  deepYieldable,
  createDeepYieldableReactiveValue,
  insertDeepYieldable,
  provideReactiveReadObserver,
  type ReactiveReadEdge,
} from './reactive-read';
import { state } from './state';
import { query } from './query';
import { mutation } from './mutation';
import { asyncProcess } from './async-process';
import { queryParams } from './query-params';

describe('yieldable reactive reads', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('reads the root state and a chain of insertion computed values with yield*', () => {
    const counter = TestBed.runInInjectionContext(() =>
      craftUse(
        state(
          'counter',
          1,
          insertStatePipe(
            ({ state, set }) => ({
              setValue: (value: number) => set(value),
              doubled: craftComputed(function* () {
                return (yield* state()) * 2;
              }),
            }),
            ({ insertions }) => ({
              tripled: craftComputed(function* () {
                return (yield* insertions.doubled()) * 3;
              }),
            }),
            ({ insertions }) => ({
              quadrupled: craftComputed(function* () {
                return (yield* insertions.tripled()) * 4;
              }),
            }),
          ),
        ),
      ),
    );

    expect(craftUse(counter())).toBe(1);
    expect(craftUse(counter.doubled())).toBe(2);
    expect(craftUse(counter.tripled())).toBe(6);
    expect(craftUse(counter.quadrupled())).toBe(24);

    craftUse(counter.setValue(2));

    expect(craftUse(counter())).toBe(2);
    expect(craftUse(counter.doubled())).toBe(4);
    expect(craftUse(counter.tripled())).toBe(12);
    expect(craftUse(counter.quadrupled())).toBe(48);
  });

  it('supports direct propagation and traces every computed dependency edge', () => {
    const edges: ReactiveReadEdge[] = [];
    TestBed.configureTestingModule({
      providers: [provideReactiveReadObserver((edge) => edges.push(edge))],
    });

    const counter = TestBed.runInInjectionContext(() =>
      craftUse(
        state(
          'counter',
          3,
          insertStatePipe(
            ({ state }) => ({
              forwarded: craftComputed(function* () {
                return yield* state();
              }),
            }),
            ({ insertions }) => ({
              derived: craftComputed(function* () {
                return (yield* insertions.forwarded()) + 1;
              }),
            }),
          ),
        ),
      ),
    );

    expect(craftUse(counter.derived())).toBe(4);
    expect(
      edges.map(({ reader, dependency }) => [reader?.name, dependency.name]),
    ).toEqual(
      expect.arrayContaining([
        ['derived', 'forwarded'],
        ['forwarded', 'counter'],
      ]),
    );
  });

  it('projects object readers lazily, stably and with the full path', () => {
    const edges: ReactiveReadEdge[] = [];
    TestBed.configureTestingModule({
      providers: [provideReactiveReadObserver((edge) => edges.push(edge))],
    });

    const source = signal({ id: 1, profile: { name: 'Ada' } });
    const user = TestBed.runInInjectionContext(() =>
      craftUse(
        state(
          'user',
          source,
          insertDeepYieldable(),
        ),
      ),
    );

    const id = user.id;
    expect(id).toBe(user.id);
    expect(craftUse(id())).toBe(1);
    expect(craftUse(user.profile.name())).toBe('Ada');

    const displayName = TestBed.runInInjectionContext(() =>
      craftComputed('displayName', function* () {
        return yield* user.profile.name();
      }),
    );
    expect(craftUse(displayName())).toBe('Ada');
    expect(
      edges.some(
        ({ reader, dependency }) =>
          reader?.name === 'displayName' && dependency.path === 'user.profile.name',
      ),
    ).toBe(true);

    source.set({ id: 2, profile: { name: 'Grace' } });
    expect(craftUse(id())).toBe(2);
    expect(craftUse(user.profile.name())).toBe('Grace');
  });

  it('adapts a plain yieldable input without reading it during construction', () => {
    let reads = 0;
    const rawUser = function* () {
      reads++;
      return { id: 7 };
    };
    const user = deepYieldable(rawUser);

    expect(reads).toBe(0);
    expect(craftUse(user.id())).toBe(7);
    expect(reads).toBe(1);
  });

  it('projects resource exception buckets as deep reactive readers', () => {
    const loaderException = craftException(
      { _tag: 'PROFILE_NOT_FOUND' },
      { userId: 'user-404' },
    );
    const paramsException = craftException(
      { _tag: 'INVALID_PROFILE_ID' },
      { reason: 'missing' },
    );
    const source = signal<{
      list: (typeof paramsException | typeof loaderException)[];
      params: typeof paramsException | undefined;
      loader: typeof loaderException | undefined;
    }>({
      list: [paramsException, loaderException],
      params: paramsException,
      loader: loaderException,
    });
    const exceptions = TestBed.runInInjectionContext(() =>
      createDeepYieldableReactiveValue(source, 'exceptions', {
        primitive: 'query',
        path: 'profileQuery.exceptions',
      }),
    );

    expect(craftUse(exceptions.loader())).toBe(loaderException);
    expect(craftUse(exceptions.params())).toBe(paramsException);
    expect(craftUse(exceptions.list())).toEqual([
      paramsException,
      loaderException,
    ]);

    source.set({
      list: [],
      params: undefined,
      loader: undefined,
    });
    expect(craftUse(exceptions.loader())).toBeUndefined();
    expect(craftUse(exceptions.params())).toBeUndefined();
    expect(craftUse(exceptions.list())).toEqual([]);
  });

  it('rejects unknown yields with the craftComputed-specific error', () => {
    const invalid = TestBed.runInInjectionContext(() =>
      craftComputed('invalid', function* () {
        yield { unknown: true };
        return 1;
      }),
    );

    expect(() => craftUse(invalid())).toThrow(
      'craftComputed generators can only yield Craft dependencies and reactive read requests; received an unknown yield.',
    );
  });

  it('adapts nested reactive properties of query, mutation and asyncProcess', () => {
    TestBed.configureTestingModule({ providers: [...provideCraftRouter([])] });
    const refs = TestBed.runInInjectionContext(() => ({
      query: craftUse(
        query('users', {
          params: () => 'all',
          loader: async () => [{ id: 1 }],
        }),
      ),
      mutation: craftUse(
        mutation('saveUser', {
          method: (id: number) => id,
          loader: async ({ params }) => ({ id: params }),
        }),
      ),
      asyncProcess: craftUse(
        asyncProcess('calculate', {
          method: (value: number) => value,
          loader: async ({ params }) => ({ result: params * 2 }),
        }),
      ),
      queryParams: craftUse(
        queryParams('filters', {
          state: {
            page: {
              fallbackValue: 1,
              codec: {
                decode: Number,
                encode: String,
              },
            },
          },
        }),
      ),
    }));

    expect(craftUse(refs.query.status())).toBe('loading');
    expect(craftUse(refs.query.value())).toBeUndefined();
    expect(craftUse(refs.query.hasException())).toBe(false);
    expect(craftUse(refs.query.resource.status())).toBe('loading');

    expect(craftUse(refs.mutation.status())).toBe('idle');
    expect(craftUse(refs.mutation.value())).toBeUndefined();

    expect(craftUse(refs.asyncProcess.status())).toBe('idle');
    expect(craftUse(refs.asyncProcess.value())).toBeUndefined();
    expect(craftUse(refs.asyncProcess.hasException())).toBe(false);
    expect(craftUse(refs.queryParams())).toEqual({ page: 1 });
    expect(craftUse(refs.queryParams.hasException())).toBe(false);
  });
});
