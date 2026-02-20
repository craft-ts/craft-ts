import { TestBed } from '@angular/core/testing';
import { query, QueryOutput } from './query';
import { craft } from './craft';
import { craftQuery } from './craft-query';
import { ResourceByIdRef } from './resource-by-id';
import { CraftResourceRef } from './util/craft-resource-ref';
import { craftException } from './business-exception';
import { computed, signal } from '@angular/core';

type User = {
  id: string;
  name: string;
  email: string;
};

describe('query', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('1- should accept signal param as source', () => {
    TestBed.runInInjectionContext(() => {
      const queryRef = query({
        params: () => '5',
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });
      expect(queryRef).toBeDefined();
      const queryResult = queryRef;
      expect(queryResult.resourceParamsSrc).toBeDefined();
      expect(queryResult.resourceParamsSrc()).toEqual('5');
    });
  });

  it('should return undefined with safeValue when status is error, while value throws', async () => {
    await TestBed.runInInjectionContext(async () => {
      const queryRef = query({
        params: () => 'error',
        loader: async ({ params }) => {
          throw new Error('Test error');
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });

      await vi.runAllTimersAsync();
      expect(queryRef.status()).toBe('error');
      expect(queryRef.error()).toBeInstanceOf(Error);
      expect(queryRef.error()?.message).toBe('Test error');

      // safeValue should return undefined without throwing
      expect(queryRef.safeValue()).toBeUndefined();
    });
  });

  it('should capture method exceptions and skip query execution', () => {
    TestBed.runInInjectionContext(() => {
      const loaderSpy = vi.fn(
        async ({ params }: { params: { term: string } }) => ({
          id: params.term,
          name: 'John Doe',
          email: 'test@a.com',
        }),
      );

      const queryRef = query({
        method: (term: string) =>
          term.length < 3
            ? craftException(
                { code: 'SEARCH_TERM_TOO_SHORT' },
                {
                  minLength: 3,
                  term,
                },
              )
            : { term },
        loader: loaderSpy,
      });

      queryRef.mutate('ab');

      expect(loaderSpy).not.toHaveBeenCalled();
      expect(queryRef.resourceParamsSrc()).toBeUndefined();
      expect(queryRef.exceptions?.().method).toEqual({
        SEARCH_TERM_TOO_SHORT: {
          minLength: 3,
          term: 'ab',
        },
      });
    });
  });
});

describe('query with identifier>', () => {
  it('Retrieve returned types of queryByIdFn', () => {
    TestBed.runInInjectionContext(() => {
      const queryByIdFn = query({
        params: () => '5',
        identifier: (params) => params,
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });

      expectTypeOf(queryByIdFn).toEqualTypeOf<
        QueryOutput<
          {
            id: string;
            name: string;
            email: string;
          },
          string,
          unknown,
          unknown,
          string,
          {}
        >
      >();
    });
  });
});

describe('craftQuery using query', () => {
  it('1- Should expose a query resource', () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery('user', () =>
        query({
          params: () => '5',
          loader: async ({ params }) => {
            return {
              id: params,
              name: 'John Doe',
              email: 'test@a.com',
            };
          },
        }),
      ),
    );

    TestBed.runInInjectionContext(() => {
      const store = injectCraft();

      expect(store.user).toBeDefined();
    });
  });
});

describe('query Insertions output', () => {
  it('should accept an Insertions output, that appear in the store', () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery('user', () =>
        query(
          {
            params: () => '5',
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          },
          () => ({
            pagination: {
              page: 1,
            },
          }),
        ),
      ),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectCraft();
      expect(store.user.pagination).toEqual({ page: 1 });
      expect(store.user.pagination).toBeDefined();
    });
  });

  it('should accept an Insertion, with the correct resource infer', () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery('user', () =>
        query(
          {
            params: () => '5',
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          },
          (data) => {
            expectTypeOf(data.resource).toEqualTypeOf<
              CraftResourceRef<
                NoInfer<{
                  id: string;
                  name: string;
                  email: string;
                }>,
                string
              >
            >();
            expect(data.resource).toBeDefined();
            return {
              pagination: {
                page: 1,
              },
            };
          },
        ),
      ),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectCraft();
      expect(store.user.pagination).toEqual({ page: 1 });
      expect(store.user.pagination).toBeDefined();
    });
  });

  it('should accept an Insertion, with the correct resourceById infer', () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery('user', () =>
        query(
          {
            params: () => '5',
            identifier: (params) => params,
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          },
          (data) => {
            expectTypeOf(data.resourceById).toEqualTypeOf<
              ResourceByIdRef<
                string,
                NoInfer<{
                  id: string;
                  name: string;
                  email: string;
                }>,
                string
              >
            >();
            expect(data.resourceById).toBeDefined();
            return {
              pagination: {
                page: 1,
              },
            };
          },
        ),
      ),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectCraft();
      expect(store.user.pagination).toEqual({ page: 1 });
      expect(store.user.pagination).toBeDefined();
    });
  });

  it('should accept an insertion output, that appear in the store', () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery('user', () =>
        query(
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
          (data) => {
            console.log('data', data);
            return {
              pagination: {
                page: 1,
              },
            };
          },
        ),
      ),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectCraft();
      expectTypeOf(store.user.pagination).toEqualTypeOf<{
        page: number;
      }>();
      expect(store.user.pagination).toBeDefined();
    });
  });
  it('should accept multiple insertions, that appear in the store', () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery('user', () =>
        query(
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
    );
    TestBed.runInInjectionContext(() => {
      const store = injectCraft();
      //insert 1
      expectTypeOf(store.user.pagination).toEqualTypeOf<{
        page: number;
      }>();
      expect(store.user.pagination).toBeDefined();

      //insert 2
      expectTypeOf(store.user.someOtherInfo).toEqualTypeOf<boolean>();
      expect(store.user.someOtherInfo).toBeDefined();
    });
  });
  it('should accept seven insertions, all outputs appear in the store', () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery('user', () =>
        query(
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
          // insert 1
          () => ({ ext1: 1 }),
          // insert 2
          ({ insertions: inserts }) => ({ ext2: inserts.ext1 + 1 }),
          // insert 3
          ({ insertions: inserts }) => ({ ext3: inserts.ext2 + 1 }),
          // insert 4
          ({ insertions: inserts }) => ({ ext4: inserts.ext3 + 1 }),
          // insert 5
          ({ insertions: inserts }) => ({ ext5: inserts.ext4 + 1 }),
          // insert 6
          ({ insertions: inserts }) => ({ ext6: inserts.ext5 + 1 }),
          // insert 7
          ({ insertions: inserts }) => ({ ext7: inserts.ext6 + 1 }),
        ),
      ),
    );
    TestBed.runInInjectionContext(() => {
      const store = injectCraft();
      expectTypeOf(store.user.ext1).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext2).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext3).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext4).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext5).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext6).toEqualTypeOf<number>();
      expectTypeOf(store.user.ext7).toEqualTypeOf<number>();
      expect(store.user.ext1).toBeDefined();
      expect(store.user.ext2).toBeDefined();
      expect(store.user.ext3).toBeDefined();
      expect(store.user.ext4).toBeDefined();
      expect(store.user.ext5).toBeDefined();
      expect(store.user.ext6).toBeDefined();
      expect(store.user.ext7).toBeDefined();
    });
  });
});

describe('query exceptions', () => {
  it('should expose hasException/list, keep legacy scope maps, and auto-clear stale exceptions', async () => {
    await TestBed.runInInjectionContext(async () => {
      const queryRef = query(
        {
          method: (mode: 'method-error' | 'loader-error' | 'ok') =>
            mode === 'method-error'
              ? craftException(
                  { code: 'DUPLICATED_CODE' },
                  {
                    from: 'method',
                  },
                )
              : { mode },
          loader: async ({ params }) => {
            if (params.mode === 'loader-error') {
              return craftException(
                { code: 'DUPLICATED_CODE' },
                {
                  from: 'loader',
                },
              );
            }
            return {
              id: params.mode,
              name: 'John Doe',
              email: 'test@a.com',
            };
          },
        },
        () => ({
          validateMode: (mode: 'insertion-error' | 'ok') =>
            mode === 'insertion-error'
              ? craftException(
                  { code: 'DUPLICATED_CODE' },
                  {
                    from: 'insertion',
                  },
                )
              : undefined,
        }),
      );

      expectTypeOf(queryRef.hasException).toEqualTypeOf<() => boolean>();

      expect(queryRef.hasException()).toBe(false);
      expect(queryRef.exceptions!().list).toEqual([]);

      queryRef.mutate('method-error');
      queryRef.mutate('loader-error');
      await Promise.resolve();
      queryRef.validateMode('insertion-error');

      expect(queryRef.exceptions!().method.DUPLICATED_CODE).toEqual({
        from: 'method',
      });
      expect(queryRef.exceptions!().loader.DUPLICATED_CODE).toEqual({
        from: 'loader',
      });
      expect(queryRef.exceptions!().methodInsertion.DUPLICATED_CODE).toEqual({
        from: 'insertion',
      });
      expect(queryRef.hasException()).toBe(true);
      expect(queryRef.exceptions!().list.map((item) => item.id)).toEqual([
        'methodInsertion:DUPLICATED_CODE',
        'loader:DUPLICATED_CODE',
        'method:DUPLICATED_CODE',
      ]);
      expect(
        queryRef.exceptions!().list.every(
          (item) => typeof item.updatedAt === 'number',
        ),
      ).toBe(true);

      queryRef.validateMode('ok');
      expect(queryRef.exceptions!().methodInsertion).toEqual({});

      queryRef.mutate('ok');
      await Promise.resolve();

      expect(queryRef.exceptions!().loader).toEqual({});
      expect(queryRef.exceptions!().method).toEqual({});
      expect(queryRef.exceptions!().methodInsertion).toEqual({});
      expect(queryRef.exceptions!().list).toEqual([]);
      expect(queryRef.hasException()).toBe(false);
    });
  });

  it('should allow to return an exception from params function, and skip the loader execution', () => {
    const myUserId = signal(0);
    const queryRef = query({
      params: () =>
        myUserId() > 0
          ? myUserId()
          : craftException({ code: 'INVALID_USER_ID' }, { id: myUserId() }),
      loader: async ({ params }) => {
        return {
          id: params,
          name: 'John Doe',
          email: 'test@a.com',
        };
      },
    });
    // todo fix it
    const paramsExceptions = (queryRef.exceptions!() as any).params as Record<
      string,
      unknown
    >;
    expect(paramsExceptions.INVALID_USER_ID).toBeDefined();
    expect(paramsExceptions.INVALID_USER_ID).toEqual({ id: 0 });
    expectTypeOf(paramsExceptions.INVALID_USER_ID).toEqualTypeOf<unknown>();
  });
  it('should allow to return an exception from the loader function', () => {
    const myUserId = signal(0);
    const queryRef = query({
      params: myUserId,
      loader: async ({ params }) => {
        if (params === 0) {
          return craftException({ code: 'INVALID_USER_ID' }, { id: params });
        }
        return {
          id: params,
          name: 'John Doe',
          email: 'test@a.com',
        };
      },
    });
    expect(queryRef.exceptions!().loader.INVALID_USER_ID).toBeDefined();
    expectTypeOf(queryRef.exceptions!().loader.INVALID_USER_ID).toEqualTypeOf<{
      id: number;
    }>();
  });
  it('When loader returns exceptions, the safeValue and value should not include the exception', () => {
    const myUserId = signal(0);
    const queryRef = query({
      params: myUserId,
      loader: async ({ params }) => {
        if (params === 0) {
          return craftException({ code: 'INVALID_USER_ID' }, { id: params });
        }
        return {
          id: params,
          name: 'John Doe',
          email: 'test@a.com',
        };
      },
    });
    expect(queryRef.exceptions!().loader.INVALID_USER_ID).toBeDefined();
    expectTypeOf(queryRef.exceptions!().loader.INVALID_USER_ID).toEqualTypeOf<{
      id: number;
    }>();
    expectTypeOf(queryRef.safeValue()).toEqualTypeOf<
      | {
          id: number;
          name: string;
          email: string;
        }
      | undefined
    >();
    expectTypeOf(queryRef.value()).toEqualTypeOf<
      | {
          id: number;
          name: string;
          email: string;
        }
      | undefined
    >();
  });
  it('should allow to return an exception from a computed insertion', () => {
    const myUserId = signal(5);
    const queryRef = query(
      {
        params: myUserId,
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      },
      ({ state, resource }) => ({
        isValueAndParamSyncedException: computed(() =>
          resource.paramSrc() !== state().id
            ? craftException(
                { code: 'PARAM_VALUE_MISMATCH' },
                {
                  param: resource.paramSrc(),
                  value: state().id,
                },
              )
            : undefined,
        ),
      }),
    );
    expectTypeOf(
      queryRef.exceptions!().computedInsertion.PARAM_VALUE_MISMATCH,
    ).toEqualTypeOf<{ param: number | undefined; value: number }>();
  });

  it('should allow to return an exception from an insertion method', () => {
    const queryRef = query(
      {
        params: () => '5',
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      },
      () => ({
        validateName: (name: string) =>
          name.length < 3
            ? craftException(
                { code: 'PARAM_VALUE_MISMATCH' },
                {
                  expectedMinLength: 3,
                  currentLength: name.length,
                },
              )
            : undefined,
      }),
    );

    queryRef.validateName('ab');

    expect(queryRef.exceptions!().methodInsertion.PARAM_VALUE_MISMATCH).toEqual(
      {
        expectedMinLength: 3,
        currentLength: 2,
      },
    );
  });

  it('should infer config and previous insertion exceptions in insertion contexts', () => {
    TestBed.runInInjectionContext(() => {
      const throwRef = signal(true);

      query(
        {
          params: () =>
            throwRef()
              ? craftException(
                  { code: 'PARAM_VALUE_MISMATCH' },
                  { from: 'params' },
                )
              : '5',
          loader: async ({ params }) => ({
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          }),
        },
        ({ exceptions }) => {
          expectTypeOf(
            exceptions().params.PARAM_VALUE_MISMATCH,
          ).toEqualTypeOf<unknown>();

          return {
            firstComputedException: computed(() =>
              craftException(
                { code: 'PARAM_VALUE_MISMATCH' },
                {
                  from: 'insertion-1' as const,
                },
              ),
            ),
          };
        },
        ({ exceptions }) => {
          expectTypeOf(
            exceptions().computedInsertion.PARAM_VALUE_MISMATCH,
          ).toEqualTypeOf<{ from: 'insertion-1' }>();
          return {};
        },
      );
    });
  });

  it('should infer config and previous insertion exceptions in insertion contexts', () => {
    TestBed.runInInjectionContext(() => {
      const throwRef = signal(true);

      const q = query(
        {
          params: () =>
            throwRef()
              ? craftException(
                  {
                    code: 'PARAM_VALUE_MISMATCH',
                  },
                  { from: 'params' },
                )
              : '5',
          loader: async ({ params }) => ({
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          }),
        },
        ({ exceptions }) => {
          expectTypeOf(
            exceptions().params.PARAM_VALUE_MISMATCH,
          ).toEqualTypeOf<unknown>();

          return {
            firstComputedException: computed(() =>
              craftException(
                { code: 'COMPUTED_VALUE_MISMATCH' },
                {
                  from: 'insertion-1' as const,
                },
              ),
            ),
            methodException: (value: string) =>
              craftException({ code: 'METHOD_VALUE_MISMATCH' }, { value }),
          };
        },
        ({ exceptions }) => {
          expectTypeOf(
            exceptions().computedInsertion.COMPUTED_VALUE_MISMATCH,
          ).toEqualTypeOf<{ from: 'insertion-1' }>();
          return {};
        },
      );
      expectTypeOf(q.exceptions!()?.computedInsertion).toEqualTypeOf<{
        COMPUTED_VALUE_MISMATCH: { from: 'insertion-1' };
      }>();
    });
  });

  it('should auto-clear computed insertion exceptions on success transition', async () => {
    await TestBed.runInInjectionContext(async () => {
      const shouldFail = signal(true);
      const queryRef = query(
        {
          params: () => '5',
          loader: async ({ params }) => ({
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          }),
        },
        () => ({
          computedFailure: computed(() =>
            shouldFail()
              ? craftException({ code: 'COMPUTED_FAILURE' }, { active: true })
              : undefined,
          ),
        }),
      );

      expect(queryRef.exceptions!().computedInsertion.COMPUTED_FAILURE).toEqual(
        {
          active: true,
        },
      );
      expect(queryRef.hasException()).toBe(true);

      shouldFail.set(false);
      await Promise.resolve();

      expect(queryRef.exceptions!().computedInsertion).toEqual({});
      expect(queryRef.exceptions!().list).toEqual([]);
      expect(queryRef.hasException()).toBe(false);
    });
  });

  it('should expose identifier-scoped exceptions for parallel queries and insertion methods', async () => {
    await TestBed.runInInjectionContext(async () => {
      const currentId = signal<'A' | 'B'>('A');
      const queryRef = query(
        {
          params: () => currentId(),
          identifier: (id) => id,
          loader: async ({ params }) =>
            craftException(
              {
                code: 'PARSE_FAILED',
                identifier: params,
              },
              { params },
            ),
        },
        ({ resourceParamsSrc, identifier }) => ({
          validateStorage: () =>
            craftException(
              {
                code: 'INSERTION_PARSE_FAILED',
                identifier,
              },
              {
                params: resourceParamsSrc(),
              },
            ),
        }),
      );

      await vi.runAllTimersAsync();
      currentId.set('B');
      await vi.runAllTimersAsync();

      queryRef.validateStorage();
      currentId.set('A');
      queryRef.validateStorage();

      expect(queryRef.exceptions!().loader).toEqual({
        A: {
          PARSE_FAILED: { params: 'A' },
        },
        B: {
          PARSE_FAILED: { params: 'B' },
        },
      });
      expect(queryRef.exceptions!().methodInsertion).toEqual({
        A: {
          INSERTION_PARSE_FAILED: { params: 'A' },
        },
        B: {
          INSERTION_PARSE_FAILED: { params: 'B' },
        },
      });
    });
  });

  it('should keep params exceptions outside identifier mapping', () => {
    TestBed.runInInjectionContext(() => {
      const rawId = signal(0);
      const queryRef = query({
        params: () =>
          rawId() > 0
            ? rawId()
            : craftException({ code: 'INVALID_ID' }, { id: rawId() }),
        identifier: (id) => String(id),
        loader: async ({ params }) => ({
          id: params,
          name: 'John Doe',
          email: 'test@a.com',
        }),
      });

      expect(
        ((queryRef.exceptions!() as any).params as Record<string, unknown>)
          .INVALID_ID,
      ).toEqual({ id: 0 });
      expect(queryRef.exceptions!().loader).toEqual({});
    });
  });
});
