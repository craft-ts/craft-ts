import { TestBed } from '@angular/core/testing';
import { Expect, Equal } from 'test-type';
import { inject, InjectionToken } from '@angular/core';
import { vi } from 'vitest';
import { queryById } from '../query-by-id';
import { craftQueryById } from './craft-query-by-id';
import { craft } from './craft';
import { MergeObject } from '../types/util.type';
import { ResourceByIdRef } from '../resource-by-id';
import { craftMutation } from './craft-mutation';
import { mutation } from '../mutation';
import { craftMutationById } from './craft-mutation-by-id';
import { mutationById } from '../mutation-by-id';

type User = {
  id: string;
  name: string;
  email: string;
};

describe('queryById', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('Retrieve returned types of queryByIdFn', () => {
    TestBed.runInInjectionContext(() => {
      const queryByIdFn = queryById({
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
      type queryByIdFn__types = (typeof queryByIdFn)['__types'];

      type ExpectQueryByFnTypesToBeRetrieved = Expect<
        Equal<
          queryByIdFn__types,
          {
            state: NoInfer<{
              id: string;
              name: string;
              email: string;
            }>;
            params: string;
            args: unknown;
            isGroupedResource: true;
            groupIdentifier: string;
          }
        >
      >;
    });
  });
});
describe('craftQueryById', () => {
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
      craftQueryById('user', () =>
        queryById({
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

      expect(store.userQueryById).toBeDefined();

      await vi.runAllTimersAsync();
      expect(store.userQueryById()['5']?.value()).toBe(returnedUser);

      type ExpectUserQueryToBeAnObjectWithResourceByIdentifier = Expect<
        Equal<
          typeof store.userQueryById,
          MergeObject<
            ResourceByIdRef<
              string,
              NoInfer<{
                id: string;
                name: string;
                email: string;
              }>,
              string
            >,
            unknown
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
      craftMutation('user', () =>
        mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
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
      const userQuery5 = store.userQueryById()['5'];
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
      craftMutation('user', () =>
        mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
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
      const userQuery5 = store.userQueryById()['5'];
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
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutation('user', () =>
        mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            await wait(10);
            return params;
          },
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
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
      const userQuery5 = store.userQueryById()['5'];
      expect(userQuery5?.value()).toBe(returnedUser);
      const userQuery5ReloadSpy = vi.spyOn(userQuery5!, 'reload');
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
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutationById('user', () =>
        mutationById({
          method(user: User) {
            return user;
          },
          identifier: (params) => params.id,
          loader: async ({ params }) => {
            await wait(10);
            return params;
          },
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutationById: {
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
      const userQuery5 = store.userQueryById()['5'];
      await vi.runAllTimersAsync();

      expect(userQuery5?.value()).toBe(returnedUser);
      const userQuery5ReloadSpy = vi.spyOn(userQuery5!, 'reload');
      store.mutateUserById({
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
      craftMutationById('user', () =>
        mutationById({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
          identifier: (params) => params.id,
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutationById: {
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
      const userQuery5 = store.userQueryById()['5'];
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUserById({
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
      craftMutationById('user', () =>
        mutationById({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
          identifier: (params) => params.id,
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutationById: {
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
      const userQuery5 = store.userQueryById()['5'];
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUserById({
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
      craftMutationById('user', () =>
        mutationById({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
          identifier: (params) => params.id,
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutationById: {
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
      const userQuery5 = store.userQueryById()['5'];
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUserById({
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
      craftMutationById('user', () =>
        mutationById({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
          identifier: (params) => params.id,
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
            params: () => '5',
            loader: async ({ params }) => {
              return returnedUser;
            },
            identifier: (params) => params,
          }),
        {
          on: {
            userMutationById: {
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
      const userQuery5 = store.userQueryById()['5'];
      expect(userQuery5?.value()).toBe(returnedUser);

      store.mutateUserById({
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
      craftMutation('user', () =>
        mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
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
      const userQuery5 = store.userQueryById()['5'];
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
      craftMutation('user', () =>
        mutation({
          method(user: User) {
            return user;
          },
          async loader({ params }) {
            return params;
          },
        })
      ),
      craftQueryById(
        'user',
        () =>
          queryById({
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
      const userQuery5 = store.userQueryById()['5'];
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
      craftQueryById(
        'user',
        () =>
          queryById({
            params: () => '5',
            loader: async ({ params }) => {
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
        StoreFeatureQueryType['userQueryById'],
        MergeObject<
          ResourceByIdRef<
            string,
            NoInfer<{
              id: string;
              name: string;
              email: string;
            }>,
            string
          >,
          unknown
        >
      >
    >;
  });
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
