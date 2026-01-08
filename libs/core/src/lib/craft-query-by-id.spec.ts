import { TestBed } from '@angular/core/testing';
import { Expect, Equal } from 'test-type';
import { computed, effect, inject, InjectionToken } from '@angular/core';
import { Mock, vi } from 'vitest';
import { query, QueryOutput } from './query';
import { craft } from './craft';
import { craftQuery } from './craft-query';
import { craftMutations } from './craft-mutations';
import { mutation } from './mutation';
import { ResourceByIdRef } from './resource-by-id';

type User = {
  id: string;
  name: string;
  email: string;
};

describe('parallel queries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('Retrieve returned types of queryByIdFn', () => {
    TestBed.runInInjectionContext(() => {
      const queryByIdFn = query({
        params: () => '5',
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
        identifier: (params) => params,
      });

      type ExpectQueryByFnTypesToBeRetrieved = Expect<
        Equal<
          typeof queryByIdFn,
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
        >
      >;
    });
  });
});
describe('craftQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('1- Should expose a query with a record of resource by id', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery('user', () =>
        query({
          params: () => '5',
          loader: async ({ params }) => {
            return returnedUser;
          },
          identifier: (params) => params,
        })
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);

      expect(store.user).toBeDefined();

      await vi.runAllTimersAsync();
      expect(store.user.select('5')?.value()).toBe(returnedUser);

      type ExpectUserQueryToBeAnObjectWithResourceByIdentifier = Expect<
        Equal<
          typeof store.user,
          QueryOutput<
            NoInfer<{
              id: string;
              name: string;
              email: string;
            }>,
            string,
            unknown,
            unknown,
            string,
            {}
          >
        >
      >;
    });
  });

  it('3- Declarative: should handle optimistic updates on query value', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
        }),
      })),
      craftQuery(
        'user',
        () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutation: {
              optimisticUpdate: ({ mutationParams }) => mutationParams,
              filter: ({ mutationParams, queryIdentifier }) =>
                mutationParams.id === queryIdentifier,
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(userQuery5?.value()).toEqual({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
    });
  });

  it('4- Declarative: should handle optimistic patch on query value', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
        }),
      })),
      craftQuery(
        'user',
        () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutation: {
              optimisticPatch: {
                name: ({ mutationParams }) => mutationParams.name,
              },
              filter: ({ mutationParams, queryIdentifier }) =>
                mutationParams.id === queryIdentifier,
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(userQuery5?.value()).toEqual({
        id: '5',
        name: 'Updated User',
        email: 'test@a.com',
      });
    });
  });

  it('5- Declarative: should handle query reload on mutation change', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    let userQuery5ReloadSpy: Mock<() => boolean>;
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            await wait(10);
            return params;
          },
        }),
      })),
      craftQuery(
        'user',
        () =>
          query(
            {
              params: () => '5',
              identifier: (params) => params,
              loader: async ({ params }) => {
                return returnedUser;
              },
            },
            ({ resourceById }) => {
              const userQuery5 = computed(() => resourceById()['5']);
              effect(() => {
                const userResource5 = userQuery5();
                if (!userResource5) {
                  return;
                }
                userQuery5ReloadSpy = vi.spyOn(userResource5, 'reload');
              });
              return {};
            }
          ),
        {
          on: {
            userMutation: {
              filter: ({ mutationParams, queryIdentifier }) =>
                mutationParams.id === queryIdentifier,
              reload: {
                onMutationLoading: true,
                onMutationResolved: true,
              },
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });

      await vi.runAllTimersAsync();

      expect(userQuery5ReloadSpy.mock.calls.length).toBe(2);
    });
  });

  it('6- Declarative: should handle query reload on mutation by id change', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    let userQuery5ReloadSpy: Mock<() => boolean>;
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          identifier: (params) => params.id,
          loader: async ({ params }) => {
            await wait(10);
            return params;
          },
        }),
      })),
      craftQuery(
        'user',
        () =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                return returnedUser;
              },
              identifier: (params) => params,
            },
            ({ resourceById }) => {
              const userQuery5 = computed(() => resourceById()['5']);
              effect(() => {
                const userResource5 = userQuery5();
                if (!userResource5) {
                  return;
                }
                userQuery5ReloadSpy = vi.spyOn(userResource5, 'reload');
              });
              return {};
            }
          ),
        {
          on: {
            userMutation: {
              filter: ({ queryIdentifier, mutationIdentifier }) =>
                queryIdentifier === mutationIdentifier,
              reload: {
                onMutationLoading: true,
                onMutationResolved: true,
              },
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      await vi.runAllTimersAsync();

      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });

      await vi.runAllTimersAsync();

      expect(userQuery5ReloadSpy.mock.calls.length).toBe(2);
    });
  });

  it('7- Declarative: should handle optimistic updates (from mutation by id) on query value', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
          identifier: (params) => params.id,
        }),
      })),
      craftQuery(
        'user',
        () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutation: {
              optimisticUpdate: ({ mutationParams }) => mutationParams,
              filter: ({ mutationParams, queryIdentifier }) =>
                mutationParams.id === queryIdentifier,
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(userQuery5?.value()).toEqual({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
    });
  });

  it('8- Declarative: should handle optimistic patch on query value (from mutation by id)', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
          identifier: (params) => params.id,
        }),
      })),
      craftQuery(
        'user',
        () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutation: {
              optimisticPatch: {
                name: ({ mutationParams }) => mutationParams.name,
              },
              filter: ({ mutationParams, queryIdentifier }) =>
                mutationParams.id === queryIdentifier,
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(userQuery5?.value()).toEqual({
        id: '5',
        name: 'Updated User',
        email: 'test@a.com',
      });
    });
  });
  it('9- Declarative: should handle patch on query value (from mutation by id)', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
          identifier: (params) => params.id,
        }),
      })),
      craftQuery(
        'user',
        () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutation: {
              patch: {
                name: ({ mutationParams }) => mutationParams.name,
              },
              filter: ({ mutationParams, queryIdentifier }) =>
                mutationParams.id === queryIdentifier,
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(userQuery5?.value()).toEqual({
        id: '5',
        name: 'Updated User',
        email: 'test@a.com',
      });
    });
  });
  it('10- Declarative: should handle updates (from mutation by id) on query value', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
          identifier: (params) => params.id,
        }),
      })),
      craftQuery(
        'user',
        () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutation: {
              update: ({ mutationParams }) => mutationParams,
              filter: ({ mutationParams, queryIdentifier }) =>
                mutationParams.id === queryIdentifier,
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(userQuery5?.value()).toEqual({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
    });
  });

  it('11- Declarative: should handle updates on query value', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
        }),
      })),
      craftQuery(
        'user',
        () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutation: {
              update: ({ mutationParams }) => mutationParams,
              filter: ({ mutationParams, queryIdentifier }) =>
                mutationParams.id === queryIdentifier,
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(userQuery5?.value()).toEqual({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
    });
  });

  it('12- Declarative: should handle patch on query value', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
        }),
      })),
      craftQuery(
        'user',
        () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutation: {
              patch: {
                name: ({ mutationParams }) => mutationParams.name,
              },
              filter: ({ mutationParams, queryIdentifier }) =>
                mutationParams.id === queryIdentifier,
            },
          },
        }
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = inject(Craft);
      await vi.runAllTimersAsync();
      const userQuery5 = store.user.select('5');
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(userQuery5?.value()).toEqual({
        id: '5',
        name: 'Updated User',
        email: 'test@a.com',
      });
    });
  });

  type InferServerStateResult<T> = T extends InjectionToken<infer U>
    ? U
    : never;

  it('#1- Should expose private query type', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery(
        'user',
        () =>
          query({
            params: () => '5',
            loader: async () => {
              await wait(10);
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {}
      )
    );

    type StoreFeatureQueryType = InferServerStateResult<typeof Craft>;

    type ExpectStoreFeatureQueryTypeToBeFullyRetrieved = Expect<
      Equal<
        StoreFeatureQueryType['user']['_resourceById'],
        ResourceByIdRef<
          string,
          NoInfer<{
            id: string;
            name: string;
            email: string;
          }>,
          string
        >
      >
    >;
  });
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
