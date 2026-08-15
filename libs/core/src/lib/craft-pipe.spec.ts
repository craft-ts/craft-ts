import { computed, Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { ExtractDeps } from './branded-component/branded-component';
import { craftException, CraftExceptionResult } from './craft-exception';
import { craftService } from './craft-service';
import { provideFnWrapObserver, provideFnWrapper } from './fn-wrapper';
import { craftUnique } from './craft-unique';
import { insertStoragePersister } from './insert-storage-persister';
import { insertPaginationPlaceholderData } from './insert-pagination-placeholder-data';
import { insertReactOnMutation } from './insert-react-on-mutation';
import { insertSelect } from './insert-select';
import { mutation } from './mutation';
import { craftPipe } from './craft-pipe';
import type { YieldableInsertionWrite } from './query.core';
import { query } from './query';
import { state } from './state';
import { craftUse } from './craft-use';
import {
  LocalStoragePersister,
  provideLocalStoragePersister,
  provideSessionStoragePersister,
  provideStoragePersister,
} from './storage-persister.service';

type User = {
  id: string;
  name: string;
  email: string;
};

const runInInjectionContext = <T>(fn: () => T): T =>
  TestBed.runInInjectionContext(fn);

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

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideLocalStoragePersister(),
      provideSessionStoragePersister(),
      provideStoragePersister(function* () {
        return yield* LocalStoragePersister();
      }),
    ],
  });
});

describe('craftPipe with state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges outputs on the state ref, identically to the direct form', () => {
    runInInjectionContext(() => {
      const origin = signal(5);
      const myState = craftUse(
        state(
          'myState',
          computed(() => origin() * 2),
          (context) =>
            craftPipe(
              context,
              ({ update, set }) => ({
                increment: () => update((current) => current + 1),
                reset: () => set(0),
              }),
              ({ state: stateSignal }) => ({
                isOdd: computed(() => craftUse(stateSignal()) % 2 === 1),
              }),
            ),
        ),
      );

      expectTypeOf(myState.increment).toBeFunction();
      expectTypeOf(myState.reset).toBeFunction();
      expectTypeOf(myState.isOdd).toMatchTypeOf<Signal<boolean>>();
      expect(craftUse(myState())).toBe(10);
      expect(craftUse(myState.isOdd())).toBe(false);
      craftUse(myState.increment());
      expect(craftUse(myState())).toBe(11);
      expect(craftUse(myState.isOdd())).toBe(true);
      craftUse(myState.reset());
      expect(craftUse(myState())).toBe(0);
    });
  });

  it('runs members left to right and threads previous outputs through context.insertions', () => {
    runInInjectionContext(() => {
      const executionOrder: string[] = [];
      const myState = craftUse(
        state('myState', 0, (context) =>
          craftPipe(
            context,
            () => {
              executionOrder.push('first');
              return { a: computed(() => 1), shared: () => 'first' };
            },
            ({ insertions }) => {
              executionOrder.push('second');
              expectTypeOf(insertions.a).toEqualTypeOf<Signal<number>>();
              return {
                b: computed(() => insertions.a() + 1),
                shared: () => 'second',
              };
            },
          ),
        ),
      );

      expect(executionOrder).toEqual(['first', 'second']);
      expect(craftUse(myState.a())).toBe(1);
      expect(craftUse(myState.b())).toBe(2);
      // outputs merge left to right: the last member wins on conflicts
      expect(craftUse(myState.shared())).toBe('second');
    });
  });

  it('supports insertSelect as a member', () => {
    runInInjectionContext(() => {
      const counter = craftUse(
        state('counter', { value: 0, nestedValue: 'hello' }, (context) =>
          craftPipe(
            context,
            insertSelect('value', ({ state: st, update }) => ({
              increment: () => update((c) => c + 1),
              isOdd: computed(() => craftUse(st()) % 2 === 1),
            })),
            insertSelect('nestedValue', ({ state: st }) => ({
              totalLength: computed(() => craftUse(st()).length),
            })),
          ),
        ),
      );

      expectTypeOf(counter.selectValue().increment).toBeFunction();
      expect(counter.selectValue().isOdd()).toBe(false);
      craftUse(counter.selectValue().increment());
      expect(craftUse(counter()).value).toBe(1);
      expect(counter.selectValue().isOdd()).toBe(true);
      expect(counter.selectNestedValue().totalLength()).toBe(5);
    });
  });

  it('supports a pipe INSIDE insertSelect (each level re-passes its context)', () => {
    runInInjectionContext(() => {
      const board = craftUse(
        state(
          'board',
          { cell: { style: { color: 'white', paintCount: 0 } } },
          (context) =>
            craftPipe(
              context,
              insertSelect('cell', (cellContext) =>
                craftPipe(
                  cellContext,
                  ({ state: st }) => ({
                    styleColor: computed(() => craftUse(st()).style.color),
                  }),
                  insertSelect('style', ({ update }) => ({
                    paint: () =>
                      update((s) => ({
                        ...s,
                        color: 'black',
                        paintCount: s.paintCount + 1,
                      })),
                  })),
                ),
              ),
              ({ state: st }) => ({
                paintCount: computed(
                  () => craftUse(st()).cell.style.paintCount,
                ),
              }),
            ),
        ),
      );

      expectTypeOf(board.selectCell().selectStyle().paint).toBeFunction();
      expect(board.selectCell().styleColor()).toBe('white');
      craftUse(board.selectCell().selectStyle().paint());
      expect(craftUse(board()).cell.style.color).toBe('black');
      expect(craftUse(board()).cell.style.paintCount).toBe(1);
      expect(craftUse(board.paintCount())).toBe(1);
      expect(board.selectCell().styleColor()).toBe('black');
    });
  });

  it('resolves generator members and tracks their dependencies (types + runtime)', () => {
    const { PipeCounterReader } = craftService(
      { name: 'PipeCounterReader', scope: 'global' },
      () => ({
        read: (): number => 2,
      }),
    );
    const { PipeCounterStep } = craftService(
      { name: 'PipeCounterStep', scope: 'global' },
      () => ({
        step: (): number => 3,
      }),
    );

    runInInjectionContext(() => {
      const myState = craftUse(
        state(
          'myState',
          function* () {
            const counter = yield* PipeCounterReader(undefined, ({ read }) => ({
              read,
            }));
            return counter.read();
          },
          (context) =>
            craftPipe(
              context,
              function* ({ update }) {
                const counterStep = yield* PipeCounterStep();
                return {
                  increment: () =>
                    update((current) => current + counterStep.step()),
                };
              },
              ({ state: stateSignal }) => ({
                doubled: computed(() => craftUse(stateSignal()) * 2),
              }),
            ),
        ),
      );

      expect(craftUse(myState())).toBe(2);
      craftUse(myState.increment());
      expect(craftUse(myState())).toBe(5);
      expect(craftUse(myState.doubled())).toBe(10);

      expectTypeOf<ExtractDeps<typeof myState>>().toEqualTypeOf<{
        PipeCounterReader: {
          scope: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
          derivedPropertiesUsed: {
            read: () => number;
          };
          derivedPropertiesExposed: {
            read: () => number;
          };
        };
        PipeCounterStep: {
          scope: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
        };
      }>();
    });
  });
});

describe('craftPipe with query', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('exposes all piped insertion outputs on the store', () => {
    const { QueryPipeStore } = craftService(
      { name: 'QueryPipeStore', scope: 'global' },
      function* () {
        return {
          user: yield* query(
            'user',
            {
              params: () => '5',
              loader: async ({ params }) => {
                return {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                } satisfies User;
              },
            },
            (context) =>
              craftPipe(
                context,
                // insert 1
                () => {
                  return {
                    pagination: {
                      page: 1,
                    },
                  };
                },
                // insert 2
                ({ insertions: inserts }) => {
                  expectTypeOf(inserts).toEqualTypeOf<{
                    pagination: {
                      page: number;
                    };
                  }>();
                  return {
                    someOtherInfo: true,
                  };
                },
              ),
          ),
        };
      },
    );
    runInInjectionContext(() => {
      const store = craftUse(QueryPipeStore());
      // insert 1
      expectTypeOf(store.user.pagination).toEqualTypeOf<{
        page: number;
      }>();
      expect(store.user.pagination).toBeDefined();

      // insert 2
      expectTypeOf(store.user.someOtherInfo).toEqualTypeOf<boolean>();
      expect(store.user.someOtherInfo).toBeDefined();
    });
  });

  it('accepts seven members, all outputs appear in the store', () => {
    const { QueryPipeSevenStore } = craftService(
      { name: 'QueryPipeSevenStore', scope: 'global' },
      function* () {
        return {
          user: yield* query(
            'user',
            {
              params: () => '5',
              loader: async ({ params }) => {
                return {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                } satisfies User;
              },
            },
            (context) =>
              craftPipe(
                context,
                () => ({ ext1: 1 }),
                ({ insertions: inserts }) => ({ ext2: inserts.ext1 + 1 }),
                ({ insertions: inserts }) => ({ ext3: inserts.ext2 + 1 }),
                ({ insertions: inserts }) => ({ ext4: inserts.ext3 + 1 }),
                ({ insertions: inserts }) => ({ ext5: inserts.ext4 + 1 }),
                ({ insertions: inserts }) => ({ ext6: inserts.ext5 + 1 }),
                ({ insertions: inserts }) => ({ ext7: inserts.ext6 + 1 }),
              ),
          ),
        };
      },
    );
    runInInjectionContext(() => {
      const store = craftUse(QueryPipeSevenStore());
      expectTypeOf(store.user.ext1).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext7).toEqualTypeOf<number>();
      expect(store.user.ext1).toBe(1);
      expect(store.user.ext2).toBe(2);
      expect(store.user.ext3).toBe(3);
      expect(store.user.ext4).toBe(4);
      expect(store.user.ext5).toBe(5);
      expect(store.user.ext6).toBe(6);
      expect(store.user.ext7).toBe(7);
    });
  });

  it('typing: keeps the Exceptions inference anchor through the pipe (no collapse)', () => {
    runInInjectionContext(() => {
      const shouldFail = signal(true);

      const del = craftUse(
        mutation('del', {
          method: (id: string) => id,
          identifier: (id) => id,
          loader: async ({ params }) =>
            ({ id: params, name: 'x', email: 'x@x.x' }) satisfies User,
        }),
      );

      const q = craftUse(
        query(
          'q',
          {
            params: () =>
              shouldFail()
                ? craftException(
                    { code: 'INVALID_PAGE' },
                    { reason: 'missing' as const },
                  )
                : { page: 1 },
            identifier: (p) => `${p.page}`,
            loader: async () => [] as User[],
          },
          (context) =>
            craftPipe(
              context,
              insertStoragePersister(craftUnique({
                storeName: 'probe',
                key: 'probe',
              })),
              insertPaginationPlaceholderData({ initialValue: [] as User[] }),
              insertReactOnMutation(del, {
                filter: ({ mutationIdentifier, queryResource }) =>
                  !!queryResource
                    .value()
                    ?.some((item) => item.id === mutationIdentifier),
              }),
              insertReactOnMutation(del, {
                filter: ({ queryResource }) =>
                  queryResource.value()?.length === 0,
                reload: { onMutationResolved: true },
              }),
            ),
        ),
      );

      // higher-order insertion outputs survive the pipe and land on the ref
      expectTypeOf(craftUse(q.currentPageData())).toEqualTypeOf<User[]>();
      expectTypeOf(craftUse(q.isPlaceHolderData())).toEqualTypeOf<boolean>();

      // the Exceptions anchor is preserved: the params exception keeps its
      // literal code (a collapse would degrade it to never / a broad type)
      type ParamsException = NonNullable<
        ReturnType<typeof q.exceptions>['params']
      >;
      expectTypeOf<ParamsException['code']>().toEqualTypeOf<'INVALID_PAGE'>();
      expectTypeOf<ParamsException>().toEqualTypeOf<
        CraftExceptionResult<
          { code: 'INVALID_PAGE'; scope: 'params' },
          { reason: 'missing' }
        >
      >();
    });
  });

  it('typing: tracks generator dependencies of piped members', () => {
    const { PipeUserIdService } = craftService(
      { name: 'PipeUserIdService', scope: 'global' },
      () => ({
        read: (): string => 'user-1',
      }),
    );
    const { PipeQueryTools } = craftService(
      { name: 'PipeQueryTools', scope: 'global' },
      () => ({
        prefix: (): string => 'user',
      }),
    );
    const { PipeQueryTools2 } = craftService(
      { name: 'PipeQueryTools2', scope: 'global' },
      () => ({
        suffix: (): string => 'details',
      }),
    );

    runInInjectionContext(() => {
      const queryRef = craftUse(
        query(
          'queryRef',
          {
            params: function* () {
              const userIdService = yield* PipeUserIdService();
              return userIdService.read();
            },
            loader: async ({ params }) =>
              ({
                id: params,
                name: 'John Doe',
                email: 'john@doe.com',
              }) satisfies User,
          },
          (context) =>
            craftPipe(
              context,
              function* () {
                const queryTools = yield* PipeQueryTools();
                return {
                  queryKey: `${queryTools.prefix()}:details`,
                };
              },
              function* () {
                const queryTools2 = yield* PipeQueryTools2();
                return {
                  querySuffix: queryTools2.suffix(),
                };
              },
            ),
        ),
      );

      expectTypeOf(queryRef.queryKey).toEqualTypeOf<string>();
      expectTypeOf(queryRef.querySuffix).toEqualTypeOf<string>();
      // yields of ALL piped members are tracked (union), alongside config deps
      expectTypeOf<ExtractDeps<typeof queryRef>>().toEqualTypeOf<{
        PipeUserIdService: {
          scope: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
        };
        PipeQueryTools: {
          scope: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
        };
        PipeQueryTools2: {
          scope: 'global';
          dependencies: {};
          browserBoundary: false;
          appStart: false;
        };
      }>();
    });
  });

  it('craftPipe works with mutation too (universal pipe)', () => {
    runInInjectionContext(() => {
      const save = craftUse(
        mutation(
          'save',
          {
            method: (user: User) => user,
            loader: async ({ params }) => params,
          },
          (context) =>
            craftPipe(
              context,
              () => ({ label: 'save-user' }),
              ({ insertions }) => ({ labelLength: insertions.label.length }),
            ),
        ),
      );

      expectTypeOf(save.label).toEqualTypeOf<string>();
      expectTypeOf(save.labelLength).toEqualTypeOf<number>();
      expect(save.label).toBe('save-user');
      expect(save.labelLength).toBe('save-user'.length);
    });
  });
});

describe('craftPipe — fn-wrapper interaction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
    TestBed.resetTestingModule();
  });

  it('each member factory is individually wrapped (per-member observability)', () => {
    const m1 = ({
      update,
    }: {
      update: YieldableInsertionWrite<[
        fn: (c: number) => number,
      ], number>;
    }) => ({
      increment: () => update((c) => c + 1),
    });
    const m2 = ({ state: st }: { state: Signal<number> }) => ({
      isOdd: computed(() => st() % 2 === 1),
    });
    const wrappedFactories: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideFnWrapObserver((factory) => {
          wrappedFactories.push(factory.name || '(anonymous)');
        }),
      ],
    });
    runInInjectionContext(() =>
      craftUse(state('counter', 0, (context) => craftPipe(context, m1, m2))),
    );
    expect(wrappedFactories.filter((n) => n === 'm1').length).toBe(1);
    expect(wrappedFactories.filter((n) => n === 'm2').length).toBe(1);
  });

  it('a sync member returning a generator keeps its outputs when a FN_WRAPPER is installed', () => {
    // Regression: fn-wrapper's toGeneratorFactory must yield*-delegate a
    // generator RESULT, otherwise the generator becomes the wrapper
    // generator's return value, is never driven, and the outputs are
    // silently lost whenever any FN_WRAPPER (correlation-id tracking, app
    // snapshots) is active.
    TestBed.configureTestingModule({
      providers: [
        provideFnWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          function* (factory, thisArg, args) {
            return yield* factory.apply(thisArg, args);
          },
        ),
      ],
    });
    const myState = runInInjectionContext(() =>
      craftUse(
        state('myState', 0, (context) =>
          craftPipe(
            context,
            (memberContext) =>
              (function* () {
                return {
                  inc: () => memberContext.update((current) => current + 1),
                };
              })(),
            ({ insertions }) => ({
              incTwice: () => {
                insertions.inc();
                return insertions.inc();
              },
            }),
          ),
        ),
      ),
    );

    expect(typeof myState.inc).toBe('function');
    myState.inc();
    expect(craftUse(myState())).toBe(1);
    myState.incTwice();
    expect(craftUse(myState())).toBe(3);
  });

  it('a throwing member propagates at construction and wrappers observe it', () => {
    const caught: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideFnWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          function* (factory, thisArg, args) {
            try {
              return yield* factory.apply(thisArg, args);
            } catch (error) {
              caught.push(error);
              throw error;
            }
          },
        ),
      ],
    });
    expect(() =>
      runInInjectionContext(() =>
        craftUse(
          state('counter', 0, (context) =>
            craftPipe(
              context,
              () => ({ ok: () => 1 }),
              () => {
                throw new Error('member boom');
              },
            ),
          ),
        ),
      ),
    ).toThrow('member boom');
    expect(caught.map((c) => (c as Error).message)).toContain('member boom');
  });
});

describe('craftPipe — injector capture timing', () => {
  it('outside an injection context, construction throws like the direct forms', () => {
    expect(() =>
      craftUse(
        state('counter', 0, (context) =>
          craftPipe(
            context,
            function* ({ update }) {
              return { inc: () => update((c) => c + 1) };
            },
            ({ insertions }) => ({ inc2: insertions.inc }),
          ),
        ),
      ),
    ).toThrowError(/NG0203|injection context/);
  });

  it('constructed inside a context, insertion methods stay callable outside any context', () => {
    const s = runInInjectionContext(() =>
      craftUse(
        state('s', 0, (context) =>
          craftPipe(
            context,
            function* ({ update }) {
              return { inc: () => update((c) => c + 1) };
            },
            ({ state: st }) => ({ double: computed(() => craftUse(st()) * 2) }),
          ),
        ),
      ),
    );
    // outside any injection context now
    s.inc();
    expect(craftUse(s())).toBe(1);
    expect(craftUse(s.double())).toBe(2);
  });
});
