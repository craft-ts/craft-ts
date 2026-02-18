import { TestBed } from '@angular/core/testing';
import { query, QueryOutput } from './query';
import { craft } from './craft';
import { craftQuery } from './craft-query';
import { ResourceByIdRef } from './resource-by-id';
import { CraftResourceRef } from './util/craft-resource-ref';
import {
  derivedException,
  methodException,
  paramException,
  stateException,
} from './business-exception';
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
            ? methodException('SEARCH_TERM_TOO_SHORT', {
                minLength: 3,
                term,
              })
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
  it('should allow to return an exception from params function, and skip the loader execution', () => {
    const myUserId = signal(0);
    const queryRef = query({
      params: () =>
        myUserId() > 0
          ? myUserId()
          : paramException('INVALID_USER_ID', { id: myUserId() }),
      loader: async ({ params }) => {
        return {
          id: params,
          name: 'John Doe',
          email: 'test@a.com',
        };
      },
    });
    expect(queryRef.exceptions!().params.INVALID_USER_ID).toBeDefined();
    expect(queryRef.exceptions!().params.INVALID_USER_ID).toEqual({ id: 0 });
    expectTypeOf(
      queryRef.exceptions!().params.INVALID_USER_ID,
    ).toEqualTypeOf<unknown>();
  });
  it('should allow to return an exception from the loader function', () => {
    const myUserId = signal(0);
    const queryRef = query({
      params: myUserId,
      loader: async ({ params }) => {
        if (params === 0) {
          return stateException('INVALID_USER_ID', { id: params });
        }
        return {
          id: params,
          name: 'John Doe',
          email: 'test@a.com',
        };
      },
    });
    expect(queryRef.exceptions!().state.INVALID_USER_ID).toBeDefined();
    expectTypeOf(queryRef.exceptions!().state.INVALID_USER_ID).toEqualTypeOf<{
      id: number;
    }>();
  });
  it('When loader returns exceptions, the safeValue and value should not include the exception', () => {
    const myUserId = signal(0);
    const queryRef = query({
      params: myUserId,
      loader: async ({ params }) => {
        if (params === 0) {
          return stateException('INVALID_USER_ID', { id: params });
        }
        return {
          id: params,
          name: 'John Doe',
          email: 'test@a.com',
        };
      },
    });
    expect(queryRef.exceptions!().state.INVALID_USER_ID).toBeDefined();
    expectTypeOf(queryRef.exceptions!().state.INVALID_USER_ID).toEqualTypeOf<{
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
  it('should allow to return an exception from a derived property', () => {
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
            ? derivedException('PARAM_VALUE_MISMATCH', {
                param: resource.paramSrc(),
                value: state().id,
              })
            : undefined,
        ),
      }),
    );
    expectTypeOf(
      queryRef.exceptions!().derived.PARAM_VALUE_MISMATCH,
    ).toEqualTypeOf<{ param: number | undefined; value: number }>();
  });
});
